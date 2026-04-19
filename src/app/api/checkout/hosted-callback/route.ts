import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchTransactionDetails } from '@/lib/authnet/hosted';
import { safeJson } from '@/lib/authnet/safe-json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Auth.net Accept Hosted callback.
 *
 * Auth.net POSTs here (form-encoded) after the customer completes payment
 * on the hosted page. We cannot trust the POST body — anyone on the
 * internet could POST arbitrary data. Anti-spoof approach:
 *
 *   1. Extract the transId from the POST body.
 *   2. Re-fetch the transaction from Auth.net via
 *      getTransactionDetailsRequest using our server-side transaction key.
 *   3. Verify the refId on the authoritative transaction matches our
 *      order_number (which we passed in the ?orderNumber=... query param).
 *   4. Verify the amount matches our recorded order total within 1¢.
 *
 * Only after all three checks do we write the payments row + update the
 * order status. Then HTTP 303 redirect the customer to the thank-you
 * page.
 *
 * Error paths redirect back to /checkout with an error param so the user
 * sees a recoverable state rather than a stuck POST.
 */

function extractTransId(form: FormData): string | null {
  // Auth.net posts either transId or x_trans_id depending on config era.
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

async function handle(req: NextRequest): Promise<NextResponse> {
  const origin = originOf(req);
  const url = new URL(req.url);
  const orderNumber = url.searchParams.get('orderNumber');

  if (!orderNumber) {
    console.error('[hosted-callback] missing orderNumber query');
    return redirectTo(origin, '/checkout', { error: 'callback-missing-order' });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    form = new FormData();
  }

  const transId = extractTransId(form);

  const admin = createAdminClient();
  const { data: order, error: orderFetchErr } = await admin
    .from('orders')
    .select('id, order_number, status, total, customer_email')
    .eq('order_number', orderNumber)
    .maybeSingle();

  if (orderFetchErr || !order) {
    console.error('[hosted-callback] order lookup failed', orderFetchErr, { orderNumber });
    return redirectTo(origin, '/checkout', { error: 'callback-order-missing' });
  }

  const orderRow = order as {
    id: string;
    order_number: string;
    status: string;
    total: number | string;
    customer_email: string;
  };

  // Short-circuit: already finalised (idempotent replay).
  if (orderRow.status === 'paid' || orderRow.status === 'payment_held') {
    return redirectTo(origin, `/order/${orderRow.order_number}`);
  }

  if (!transId) {
    void admin.from('payment_audit_log').insert({
      order_id: orderRow.id,
      event_type: 'callback_missing_transid',
      source: 'hosted_callback',
      error_detail: 'Callback POST had no transId field',
    });
    return redirectTo(origin, '/checkout', { error: 'callback-no-transid' });
  }

  // Fetch authoritative transaction from Auth.net.
  const fetchRes = await fetchTransactionDetails(transId);
  if (!fetchRes.ok) {
    void admin.from('payment_audit_log').insert({
      order_id: orderRow.id,
      event_type: 'callback_lookup_failed',
      transaction_id: transId,
      error_detail: fetchRes.errorMessage,
      raw_response: safeJson((fetchRes as { raw?: unknown }).raw),
      source: 'hosted_callback',
    });
    return redirectTo(origin, '/checkout', { error: 'callback-lookup-failed' });
  }

  const tx = fetchRes.details;
  const expectedTotal = Number(orderRow.total);
  const amountCents = Math.round(expectedTotal * 100);

  // Spoof checks.
  if (tx.refId && tx.refId !== orderRow.order_number) {
    void admin.from('payment_audit_log').insert({
      order_id: orderRow.id,
      event_type: 'callback_refid_mismatch',
      transaction_id: transId,
      amount_cents: amountCents,
      raw_response: safeJson(tx.raw),
      error_detail: `refId=${tx.refId} order_number=${orderRow.order_number}`,
      source: 'hosted_callback',
    });
    return redirectTo(origin, '/checkout', { error: 'callback-refid-mismatch' });
  }

  if (tx.amount !== null && Math.abs(tx.amount - expectedTotal) > 0.01) {
    void admin.from('payment_audit_log').insert({
      order_id: orderRow.id,
      event_type: 'callback_amount_mismatch',
      transaction_id: transId,
      amount_cents: amountCents,
      raw_response: safeJson(tx.raw),
      error_detail: `authnet=${tx.amount} expected=${expectedTotal}`,
      source: 'hosted_callback',
    });
    return redirectTo(origin, '/checkout', { error: 'callback-amount-mismatch' });
  }

  // Map Auth.net responseCode → our order/payment status.
  const approved = tx.responseCode === '1';
  const held = tx.responseCode === '4';
  const declined = tx.responseCode === '2';

  if (!approved && !held) {
    // Declined / error — record and send customer back to checkout.
    void admin.from('payment_audit_log').insert({
      order_id: orderRow.id,
      event_type: declined ? 'auth_net_declined' : 'auth_net_error',
      transaction_id: transId,
      amount_cents: amountCents,
      raw_response: safeJson(tx.raw),
      error_detail: tx.responseReason ?? `responseCode=${tx.responseCode}`,
      source: 'hosted_callback',
    });
    await admin
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', orderRow.id);
    return redirectTo(origin, '/checkout', { error: 'declined' });
  }

  // Approved or held — write payments row, update order, audit.
  const paymentStatus = approved ? 'succeeded' : 'held_for_review';
  const nextOrderStatus = approved ? 'paid' : 'payment_held';
  const masked = tx.accountNumber ?? '';
  const cardLastFour = masked ? masked.replace(/\D/g, '').slice(-4) || null : null;

  const { error: payInsErr } = await admin.from('payments').insert({
    order_id: orderRow.id,
    type: 'auth_capture',
    amount: expectedTotal,
    status: paymentStatus,
    authnet_transaction_id: tx.transId,
    authnet_response_code: tx.responseCode,
    authnet_response_reason: tx.responseReason,
    authnet_avs_result: tx.avsResultCode,
    authnet_cvv_result: tx.cvvResultCode,
    fraud_held: held,
    fraud_reason: held ? tx.responseReason : null,
    card_last_four: cardLastFour,
    card_brand: tx.accountType,
    raw_response: safeJson(tx.raw),
  });

  if (payInsErr) {
    void admin.from('payment_audit_log').insert({
      order_id: orderRow.id,
      event_type: 'payment_insert_failed',
      transaction_id: tx.transId,
      amount_cents: amountCents,
      raw_response: safeJson(tx.raw),
      error_detail: payInsErr.message,
      source: 'hosted_callback',
    });
    // Still redirect to thank-you — money moved, customer gets their number.
    return redirectTo(origin, `/order/${orderRow.order_number}`, {
      warning: 'payment_record_failed',
    });
  }

  const { error: statusErr } = await admin
    .from('orders')
    .update({ status: nextOrderStatus })
    .eq('id', orderRow.id);

  if (statusErr) {
    void admin.from('payment_audit_log').insert({
      order_id: orderRow.id,
      event_type: 'status_update_failed',
      transaction_id: tx.transId,
      amount_cents: amountCents,
      raw_response: safeJson(tx.raw),
      error_detail: `intended='${nextOrderStatus}'; ${statusErr.message}`,
      source: 'hosted_callback',
    });
  }

  void admin.from('payment_audit_log').insert({
    order_id: orderRow.id,
    event_type: 'payment_inserted',
    transaction_id: tx.transId,
    amount_cents: amountCents,
    raw_response: safeJson(tx.raw),
    source: 'hosted_callback',
  });

  return redirectTo(origin, `/order/${orderRow.order_number}`);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

// Auth.net sometimes sends a GET preflight with the return URL (browser
// back button, e.g.). Accept both.
export async function GET(req: NextRequest) {
  return handle(req);
}
