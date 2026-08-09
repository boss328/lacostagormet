import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchTransactionDetails } from '@/lib/authnet/hosted';
import { finalizeOrderPayment, type FinalizableOrder } from '@/lib/checkout/finalize-payment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Auth.net webhook — server-to-server payment notifications.
 *
 * This is the safety net the hosted-payment flow lacked for its first four
 * months: order finalisation used to depend entirely on the customer's
 * browser completing the return redirect, and when that leg broke every
 * order stayed 'pending' with no trace. Auth.net delivers these
 * notifications directly and retries on non-2xx, so a paid order gets
 * finalised even if the customer closes the tab on the receipt page.
 *
 * Auth.net side (Account → Notifications → Webhooks):
 *   endpoint  https://www.lacostagourmet.com/api/webhooks/authnet/
 *             — the trailing slash is load-bearing: without it Next's
 *             trailingSlash redirect answers 308 and Auth.net's delivery
 *             does not follow redirects (the exact failure that stranded
 *             the hosted-callback flow for four months).
 *   events    net.authorize.payment.* (authcapture.created at minimum;
 *             fraud.approved/declined recommended for held orders)
 * The account's Signature Key must be in AUTHNET_SIGNATURE_KEY — every
 * delivery is HMAC-SHA512 signed (X-ANET-Signature: sha512=HEX) over the
 * raw body, and unsigned/mis-signed requests are rejected before any
 * processing.
 *
 * The payload's transId is only a pointer: we re-fetch the transaction
 * from Auth.net and resolve our order by the invoice number we set at
 * token time, then run the same finalize path as the browser callback
 * (idempotent — whichever messenger arrives second sees already_final).
 */

function verifySignature(rawBody: string, header: string | null, key: string): boolean {
  if (!header) return false;
  const provided = header.replace(/^sha512=/i, '').trim().toLowerCase();
  if (!/^[0-9a-f]{128}$/.test(provided)) return false;
  const expected = createHmac('sha512', key).update(rawBody, 'utf8').digest('hex');
  return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
}

type WebhookNotification = {
  notificationId?: string;
  eventType?: string;
  payload?: {
    entityName?: string;
    id?: string | number;
    responseCode?: number;
  };
};

export async function POST(req: NextRequest) {
  const signatureKey = process.env.AUTHNET_SIGNATURE_KEY;
  if (!signatureKey) {
    // Fail closed but loudly — a 503 makes Auth.net retry, and the log
    // line makes the missing env var findable.
    console.error('[webhooks/authnet] AUTHNET_SIGNATURE_KEY is not configured');
    return NextResponse.json({ error: 'webhook not configured' }, { status: 503 });
  }

  const rawBody = await req.text();
  const admin = createAdminClient();

  if (!verifySignature(rawBody, req.headers.get('x-anet-signature'), signatureKey)) {
    void admin.from('payment_audit_log').insert({
      order_id: null,
      event_type: 'webhook_invalid_signature',
      source: 'authnet_webhook',
      error_detail: `signature header ${req.headers.get('x-anet-signature') ? 'failed verification' : 'missing'}`,
    });
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let notification: WebhookNotification;
  try {
    notification = JSON.parse(rawBody) as WebhookNotification;
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const eventType = notification.eventType ?? '';
  const payload = notification.payload;

  // Only transaction-bearing payment events matter here; everything else
  // (test pings, customer-profile events) is acknowledged and dropped.
  if (
    !eventType.startsWith('net.authorize.payment.') ||
    payload?.entityName !== 'transaction' ||
    payload.id === undefined
  ) {
    return NextResponse.json({ received: true, ignored: true, eventType });
  }

  const transId = String(payload.id);
  const fetchRes = await fetchTransactionDetails(transId);
  if (!fetchRes.ok) {
    void admin.from('payment_audit_log').insert({
      order_id: null,
      event_type: 'webhook_lookup_failed',
      transaction_id: transId,
      error_detail: `${fetchRes.errorMessage} (${eventType})`,
      source: 'authnet_webhook',
    });
    // Network-ish failure → 503 so Auth.net redelivers; a transaction
    // Auth.net says doesn't exist won't improve with retries → 200.
    const transient = fetchRes.errorMessage === 'Could not verify transaction.';
    return NextResponse.json(
      { received: true, error: fetchRes.errorMessage },
      { status: transient ? 503 : 200 },
    );
  }

  const tx = fetchRes.details;

  if (!tx.refId) {
    void admin.from('payment_audit_log').insert({
      order_id: null,
      event_type: 'webhook_order_not_found',
      transaction_id: transId,
      error_detail: `transaction carries no invoice/refId (${eventType})`,
      source: 'authnet_webhook',
    });
    return NextResponse.json({ received: true, ignored: true });
  }

  const { data: orderRow } = await admin
    .from('orders')
    .select('id, order_number, status, total')
    .eq('order_number', tx.refId)
    .maybeSingle();

  if (!orderRow) {
    void admin.from('payment_audit_log').insert({
      order_id: null,
      event_type: 'webhook_order_not_found',
      transaction_id: transId,
      error_detail: `no order matches invoice=${tx.refId} (${eventType})`,
      source: 'authnet_webhook',
    });
    return NextResponse.json({ received: true, ignored: true });
  }

  const result = await finalizeOrderPayment({
    admin,
    order: orderRow as FinalizableOrder,
    tx,
    source: 'authnet_webhook',
    // No customer is waiting on this response, and fire-and-forget work
    // can be frozen when a serverless handler returns — await it all.
    awaitSideEffects: true,
  });

  return NextResponse.json({ received: true, outcome: result.outcome });
}
