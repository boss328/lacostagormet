import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchTransactionDetails } from '@/lib/authnet/hosted';
import { safeJson } from '@/lib/authnet/safe-json';
import { finalizeOrderPayment, type FinalizableOrder } from '@/lib/checkout/finalize-payment';

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
 *   3. Resolve OUR order and verify the authoritative transaction's
 *      refId/invoice and amount match it (finalize-payment.ts).
 *
 * The four months of stranded 'pending' orders (Apr–Aug 2026) died one
 * hop before this file: the return URL lacked its trailing slash, so
 * Next's trailingSlash redirect answered Auth.net's POST with a 308
 * that its delivery never follows (fixed at the token request in
 * checkout/create). Hardening from that incident lives here anyway:
 * order resolution does NOT depend on the ?orderNumber= query param —
 * the transaction itself carries our order number as its invoice (we
 * set refId + invoiceNumber at token time), so the authoritative
 * lookup needs nothing from the redirect; the query param is only a
 * hint. Every dead-end below writes a payment_audit_log row (order_id
 * null when unresolvable) so a silent miss can't happen again. The
 * Auth.net webhook (/api/webhooks/authnet/) finalises independently
 * of this route.
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

const ORDER_SELECT = 'id, order_number, status, total, customer_email';

async function handle(req: NextRequest): Promise<NextResponse> {
  const origin = originOf(req);
  const url = new URL(req.url);
  const orderNumberHint = url.searchParams.get('orderNumber');

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    form = new FormData();
  }

  const transId = extractTransId(form);
  const admin = createAdminClient();

  if (!transId) {
    // Nothing to verify against. Record the arrival (previously this path
    // was invisible) and bounce to checkout.
    void admin.from('payment_audit_log').insert({
      order_id: null,
      event_type: 'callback_missing_transid',
      source: 'hosted_callback',
      error_detail: `Callback had no transId field; orderNumber=${orderNumberHint ?? '(absent)'}`,
    });
    return redirectTo(origin, '/checkout', {
      error: orderNumberHint ? 'callback-no-transid' : 'callback-missing-order',
    });
  }

  // Authoritative transaction first — order resolution flows from it.
  const fetchRes = await fetchTransactionDetails(transId);
  if (!fetchRes.ok) {
    void admin.from('payment_audit_log').insert({
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

  // Resolve the order: query-param hint first, else the invoice number the
  // transaction itself carries.
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
    void admin.from('payment_audit_log').insert({
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

export async function POST(req: NextRequest) {
  return handle(req);
}

// Auth.net sometimes sends a GET preflight with the return URL (browser
// back button, e.g.). Accept both.
export async function GET(req: NextRequest) {
  return handle(req);
}
