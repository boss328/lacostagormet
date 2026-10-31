import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchTransactionDetails } from '@/lib/authnet/hosted';
import { safeJson } from '@/lib/authnet/safe-json';
import { finalizeOrderPayment, type FinalizableOrder } from '@/lib/checkout/finalize-payment';
import { verifyPendingOrderPayment } from '@/lib/checkout/verify-pending-payment';
import { MANUAL_PAYMENT_COOKIE, verifyManualPaymentGrant } from '@/lib/checkout/manual-payment-grant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Auth.net Accept Hosted return trip.
 *
 * What actually arrives here (learned 2026-08-20, the incident's second
 * layer): in the full-page-redirect integration, Auth.net returns the
 * customer with NO transaction data — a bare GET against returnUrl. The
 * transId-bearing transactResponse exists only in the iframe/communicator
 * integration. For four months after the trailing-slash 308 fix (the first
 * layer, Apr–Aug 2026) this handler kept waiting for a transId that
 * structurally could never arrive, telling every paying customer to
 * "please retry".
 *
 * So this route treats the return as a SIGNAL, not a message:
 *
 *   1. transId present anyway (future iframe integration, or Auth.net
 *      changes the redirect): use it — re-fetch the authoritative
 *      transaction and finalize. Never trust the POST body itself.
 *   2. No transId (the normal case): resolve our order from the
 *      ?orderNumber= hint, then actively verify server-side — scan
 *      Auth.net's unsettled list for our invoice number and finalize
 *      through the same idempotent path the webhook uses.
 *   3. Verification found nothing yet: land the customer on the order
 *      page's honest 'pending' state, where a poller keeps re-verifying
 *      and the webhook races alongside. Never bounce them to checkout
 *      with a "retry" message — if the charge DID go through, a retry is
 *      a double charge.
 *
 * Every dead-end writes a payment_audit_log row — awaited, never `void`:
 * supabase-js builders are lazy PromiseLikes, so a void-discarded insert
 * never even sends its request (which is why this route's forensics were
 * blank while it misbehaved).
 */

function extractTransId(form: FormData): string | null {
  for (const key of ['transId', 'x_trans_id', 'transactionId']) {
    const v = form.get(key);
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function redirectTo(base: string, path: string, params: Record<string, string> = {}) {
  const url = new URL(path, base);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, { status: 303 });
}

function originOf(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto') ?? 'http';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3001';
  return `${proto}://${host}`;
}

const ORDER_SELECT = 'id, order_number, status, total, source';

async function handle(req: NextRequest): Promise<NextResponse> {
  const origin = originOf(req);
  const url = new URL(req.url);
  const orderNumberHint = url.searchParams.get('orderNumber');

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    // The expected case: a GET (or bodyless POST) return has no form data.
    form = new FormData();
  }

  const transId = extractTransId(form);
  const admin = createAdminClient();
  async function lookupOrder(number: string | null): Promise<FinalizableOrder | null> {
    if (!number) return null;
    const { data } = await admin.from('orders').select(ORDER_SELECT).eq('order_number', number).maybeSingle();
    return data as FinalizableOrder | null;
  }
  const hintedOrder = await lookupOrder(orderNumberHint);
  function manualReturn(order: FinalizableOrder, params: Record<string, string>) {
    const grant = verifyManualPaymentGrant(req.cookies.get(MANUAL_PAYMENT_COOKIE)?.value ?? '');
    if (grant?.orderId !== order.id || grant.amountCents !== Math.round(Number(order.total) * 100)) {
      // The webhook can also confirm payment. Reveal no result to an unrelated browser.
      return redirectTo(origin, '/pay/', { error: 'link', ...(orderNumberHint ? { order: orderNumberHint } : {}) });
    }
    return redirectTo(origin, '/pay/', { ...params, order: order.order_number });
  }
  function paymentError(error: string, order = hintedOrder) {
    if (order?.source === 'manual') return manualReturn(order, { error });
    return redirectTo(origin, '/checkout', { error });
  }
  function confirmation(order: FinalizableOrder, paymentRecordFailed = false) {
    if (order.source === 'manual') return manualReturn(order, { returned: '1' });
    return redirectTo(origin, `/order/${order.order_number}`, paymentRecordFailed ? { warning: 'payment_record_failed' } : {});
  }

  // ---- Path 1: a transId arrived. Verify it authoritatively. -------------
  if (transId) {
    const fetchRes = await fetchTransactionDetails(transId);
    if (!fetchRes.ok) {
      await admin.from('payment_audit_log').insert({
        order_id: null,
        event_type: 'callback_lookup_failed',
        transaction_id: transId,
        error_detail: `${fetchRes.errorMessage}; orderNumber=${orderNumberHint ?? '(absent)'}`,
        raw_response: safeJson((fetchRes as { raw?: unknown }).raw),
        source: 'hosted_callback',
      });
      return paymentError('callback-lookup-failed');
    }

    const tx = fetchRes.details;

    // Resolve the order: query-param hint first, else the invoice number
    // the transaction itself carries.
    const order = hintedOrder ?? (tx.refId !== orderNumberHint ? await lookupOrder(tx.refId) : null);

    if (!order) {
      await admin.from('payment_audit_log').insert({
        order_id: null,
        event_type: 'callback_order_not_found',
        transaction_id: transId,
        raw_response: safeJson(tx.raw),
        error_detail: `No order matches refId=${tx.refId ?? '(none)'} orderNumber=${orderNumberHint ?? '(absent)'}`,
        source: 'hosted_callback',
      });
      return paymentError('callback-order-missing');
    }

    const result = await finalizeOrderPayment({
      admin,
      order,
      tx,
      source: 'hosted_callback',
    });

    switch (result.outcome) {
      case 'already_final':
        return confirmation(order);
      case 'refid_mismatch':
        return paymentError('callback-refid-mismatch', order);
      case 'amount_mismatch':
        return paymentError('callback-amount-mismatch', order);
      case 'transaction_unconfirmed':
        return paymentError('verification', order);
      case 'declined':
        return paymentError('declined', order);
      case 'finalized':
        return confirmation(order, result.paymentRecordFailed);
    }
  }

  // ---- Path 2: the normal data-less return. ------------------------------
  if (!orderNumberHint) {
    // No transId AND no hint — nothing to anchor on (stray probe, or a
    // return URL mangled beyond recognition).
    await admin.from('payment_audit_log').insert({
      order_id: null,
      event_type: 'callback_missing_transid',
      source: 'hosted_callback',
      error_detail: 'return carried no transId and no orderNumber hint',
    });
    return paymentError('callback-missing-order');
  }

  const order = hintedOrder;

  if (!order) {
    await admin.from('payment_audit_log').insert({
      order_id: null,
      event_type: 'callback_order_not_found',
      source: 'hosted_callback',
      error_detail: `data-less return; no order matches orderNumber=${orderNumberHint}`,
    });
    return paymentError('callback-order-missing');
  }

  if (order.status === 'paid' || order.status === 'payment_held') {
    // Webhook (or an earlier arrival) already finalised — straight to the
    // thank-you page.
    return confirmation(order);
  }

  if (order.status !== 'pending') {
    // 'cancelled' etc. — a previous decline closed this order.
    return paymentError('declined');
  }

  const verify = await verifyPendingOrderPayment({
    admin,
    order,
    source: 'hosted_callback',
    auditNoTransaction: true,
  });

  switch (verify.outcome) {
    case 'finalized':
    case 'already_final':
      return confirmation(order);
    case 'declined':
      return paymentError('declined');
    case 'refid_mismatch':
      return paymentError('callback-refid-mismatch');
    case 'amount_mismatch':
      return paymentError('callback-amount-mismatch');
    case 'transaction_unconfirmed':
      return paymentError('verification');
    case 'lookup_failed':
      if (order.source === 'manual') return paymentError('callback-lookup-failed');
      return confirmation(order);
    case 'no_transaction':
      // Can't confirm (yet). The order page's pending state says so
      // honestly and keeps polling; the webhook may land any second.
      return confirmation(order);
  }
}

export async function POST(req: NextRequest) {
  return handle(req);
}

// The redirect return is typically a GET; POST kept for completeness and
// for any future integration mode that sends one.
export async function GET(req: NextRequest) {
  return handle(req);
}
