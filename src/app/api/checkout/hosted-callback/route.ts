import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchTransactionDetails } from '@/lib/authnet/hosted';
import { safeJson } from '@/lib/authnet/safe-json';
import { finalizeOrderPayment, type FinalizableOrder } from '@/lib/checkout/finalize-payment';
import { verifyPendingOrderPayment } from '@/lib/checkout/verify-pending-payment';

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

const ORDER_SELECT = 'id, order_number, status, total, customer_email';

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
      return redirectTo(origin, '/checkout', { error: 'callback-lookup-failed' });
    }

    const tx = fetchRes.details;

    // Resolve the order: query-param hint first, else the invoice number
    // the transaction itself carries.
    const lookupNumber = orderNumberHint ?? tx.refId;
    let order: FinalizableOrder | null = null;
    if (lookupNumber) {
      const { data } = await admin
        .from('orders')
        .select(ORDER_SELECT)
        .eq('order_number', lookupNumber)
        .maybeSingle();
      order = (data as FinalizableOrder | null) ?? null;
    }
    // Hint present but stale/wrong? Fall back to the transaction's invoice.
    if (!order && orderNumberHint && tx.refId && tx.refId !== orderNumberHint) {
      const { data } = await admin
        .from('orders')
        .select(ORDER_SELECT)
        .eq('order_number', tx.refId)
        .maybeSingle();
      order = (data as FinalizableOrder | null) ?? null;
    }

    if (!order) {
      await admin.from('payment_audit_log').insert({
        order_id: null,
        event_type: 'callback_order_not_found',
        transaction_id: transId,
        raw_response: safeJson(tx.raw),
        error_detail: `No order matches refId=${tx.refId ?? '(none)'} orderNumber=${orderNumberHint ?? '(absent)'}`,
        source: 'hosted_callback',
      });
      return redirectTo(origin, '/checkout', { error: 'callback-order-missing' });
    }

    const result = await finalizeOrderPayment({
      admin,
      order,
      tx,
      source: 'hosted_callback',
    });

    switch (result.outcome) {
      case 'already_final':
        return redirectTo(origin, `/order/${order.order_number}`);
      case 'refid_mismatch':
        return redirectTo(origin, '/checkout', { error: 'callback-refid-mismatch' });
      case 'amount_mismatch':
        return redirectTo(origin, '/checkout', { error: 'callback-amount-mismatch' });
      case 'declined':
        return redirectTo(origin, '/checkout', { error: 'declined' });
      case 'finalized':
        return redirectTo(
          origin,
          `/order/${order.order_number}`,
          result.paymentRecordFailed ? { warning: 'payment_record_failed' } : {},
        );
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
    return redirectTo(origin, '/checkout', { error: 'callback-missing-order' });
  }

  const { data } = await admin
    .from('orders')
    .select(ORDER_SELECT)
    .eq('order_number', orderNumberHint)
    .maybeSingle();
  const order = (data as FinalizableOrder | null) ?? null;

  if (!order) {
    await admin.from('payment_audit_log').insert({
      order_id: null,
      event_type: 'callback_order_not_found',
      source: 'hosted_callback',
      error_detail: `data-less return; no order matches orderNumber=${orderNumberHint}`,
    });
    return redirectTo(origin, '/checkout', { error: 'callback-order-missing' });
  }

  if (order.status === 'paid' || order.status === 'payment_held') {
    // Webhook (or an earlier arrival) already finalised — straight to the
    // thank-you page.
    return redirectTo(origin, `/order/${order.order_number}`);
  }

  if (order.status !== 'pending') {
    // 'cancelled' etc. — a previous decline closed this order.
    return redirectTo(origin, '/checkout', { error: 'declined' });
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
      return redirectTo(origin, `/order/${order.order_number}`);
    case 'declined':
      return redirectTo(origin, '/checkout', { error: 'declined' });
    case 'refid_mismatch':
      return redirectTo(origin, '/checkout', { error: 'callback-refid-mismatch' });
    case 'amount_mismatch':
      return redirectTo(origin, '/checkout', { error: 'callback-amount-mismatch' });
    case 'no_transaction':
    case 'lookup_failed':
      // Can't confirm (yet). The order page's pending state says so
      // honestly and keeps polling; the webhook may land any second.
      return redirectTo(origin, `/order/${order.order_number}`);
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
