/**
 * scripts/backfill-order-payment.ts
 *
 * Backfill a payments row for an order whose checkout silently failed
 * (Phase 4 bug). Fetches the real transaction from Auth.net via
 * getTransactionDetailsRequest, writes a payments row that reflects the
 * actual charge, updates orders.status to 'paid', and logs the repair to
 * payment_audit_log.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-order-payment.ts --order-number LCG-10004 --dry-run
 *   pnpm tsx scripts/backfill-order-payment.ts --order-number LCG-10004
 *
 * Guards:
 *   - Only acts on orders with status='pending' AND zero payments rows.
 *     Any other state is treated as healthy and the script refuses to
 *     write (loudly — prints the current state).
 *   - The Auth.net transaction ID is looked up by refId (order_number) via
 *     a search, OR can be supplied via --transaction-id if search fails.
 *   - Dry run prints every intended change and exits without writing.
 */

import fs from 'node:fs';
import { APIContracts, APIControllers, Constants as SDKConstants } from 'authorizenet';
import { createClient } from '@supabase/supabase-js';
import { resolveAuthnetEnv } from '../src/lib/authnet/environment';
import { safeJson } from '../src/lib/authnet/safe-json';

type Args = {
  orderNumber: string;
  dryRun: boolean;
  explicitTransactionId: string | null;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let orderNumber = '';
  let explicitTransactionId: string | null = null;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--order-number' || a === '--order') orderNumber = argv[++i] ?? '';
    else if (a === '--transaction-id') explicitTransactionId = argv[++i] ?? null;
    else if (a === '--dry-run') dryRun = true;
  }
  if (!orderNumber) {
    console.error('Usage: backfill-order-payment.ts --order-number LCG-10004 [--dry-run] [--transaction-id <id>]');
    process.exit(1);
  }
  return { orderNumber, dryRun, explicitTransactionId };
}

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function fetchOrderByNumber(orderNumber: string) {
  const admin = supaAdmin();
  const { data: order, error: orderErr } = await admin
    .from('orders')
    .select('id, order_number, status, total, customer_email, created_at')
    .eq('order_number', orderNumber)
    .maybeSingle();
  if (orderErr) throw new Error(`orders fetch failed: ${orderErr.message}`);
  if (!order) throw new Error(`Order ${orderNumber} not found.`);

  const { data: payments, error: payErr } = await admin
    .from('payments')
    .select('id, status, authnet_transaction_id')
    .eq('order_id', (order as { id: string }).id);
  if (payErr) throw new Error(`payments fetch failed: ${payErr.message}`);

  return { order, payments: payments ?? [] };
}

function authnetContext() {
  const env = resolveAuthnetEnv(process.env.AUTHNET_ENVIRONMENT);
  const endpoint = env === 'production' ? SDKConstants.endpoint.production : SDKConstants.endpoint.sandbox;
  const apiLoginId = process.env.AUTHNET_API_LOGIN_ID;
  const transactionKey = process.env.AUTHNET_TRANSACTION_KEY;
  if (!apiLoginId || !transactionKey) {
    throw new Error('Missing AUTHNET_API_LOGIN_ID / AUTHNET_TRANSACTION_KEY');
  }
  const merchantAuth = new APIContracts.MerchantAuthenticationType();
  merchantAuth.setName(apiLoginId);
  merchantAuth.setTransactionKey(transactionKey);
  return { merchantAuth, endpoint };
}

async function findTransactionIdByRefId(orderNumber: string): Promise<string | null> {
  const { merchantAuth, endpoint } = authnetContext();

  // getUnsettledTransactionList and getSettledBatchListRequest scan recent
  // transactions. For sandbox testing with one order, the unsettled list is
  // the fastest hit.
  const req = new APIContracts.GetUnsettledTransactionListRequest();
  req.setMerchantAuthentication(merchantAuth);
  const sorting = new APIContracts.TransactionListSorting();
  sorting.setOrderBy(APIContracts.TransactionListOrderFieldEnum.SUBMITTIMEUTC);
  sorting.setOrderDescending(true);
  req.setSorting(sorting);

  const ctrl = new APIControllers.GetUnsettledTransactionListController(req.getJSON());
  ctrl.setEnvironment(endpoint);

  const apiResponse = await new Promise<unknown>((resolve, reject) => {
    try {
      ctrl.execute(() => {
        try { resolve(ctrl.getResponse()); } catch (e) { reject(e); }
      });
    } catch (e) {
      reject(e);
    }
  });

  const response = new APIContracts.GetUnsettledTransactionListResponse(apiResponse as never);
  const resultCode = extractString(response.getMessages?.()?.getResultCode);
  if (resultCode !== 'Ok') {
    console.error('[backfill] unsettled-list call returned non-Ok:', safeJson(apiResponse));
    return null;
  }
  const txns = response.getTransactions?.()?.getTransaction?.() ?? [];
  for (const tx of txns) {
    const refId = extractString(tx?.getInvoiceNumber) ?? extractString(tx?.getRefId);
    const transId = extractString(tx?.getTransId);
    if (refId === orderNumber && transId) return transId;
  }

  return null;
}

async function fetchTransactionDetails(transactionId: string): Promise<{
  raw: unknown;
  approved: boolean;
  responseCode: string | null;
  responseReason: string | null;
  authCode: string | null;
  amount: number | null;
  cardLastFour: string | null;
  cardBrand: string | null;
  avs: string | null;
  cvv: string | null;
}> {
  const { merchantAuth, endpoint } = authnetContext();

  const req = new APIContracts.GetTransactionDetailsRequest();
  req.setMerchantAuthentication(merchantAuth);
  req.setTransId(transactionId);

  const ctrl = new APIControllers.GetTransactionDetailsController(req.getJSON());
  ctrl.setEnvironment(endpoint);

  const apiResponse = await new Promise<unknown>((resolve, reject) => {
    try {
      ctrl.execute(() => {
        try { resolve(ctrl.getResponse()); } catch (e) { reject(e); }
      });
    } catch (e) {
      reject(e);
    }
  });

  const response = new APIContracts.GetTransactionDetailsResponse(apiResponse as never);
  const resultCode = extractString(response.getMessages?.()?.getResultCode);
  if (resultCode !== 'Ok') {
    throw new Error(`getTransactionDetails returned non-Ok: ${JSON.stringify(safeJson(apiResponse)).slice(0, 500)}`);
  }
  const tx = response.getTransaction?.();
  if (!tx) throw new Error('getTransactionDetails returned no transaction');

  const responseCode = extractString(tx.getResponseCode);
  const authCode = extractString(tx.getAuthCode);
  const messages = tx.getMessages?.()?.getMessage?.();
  const responseReason = extractString(messages?.[0]?.getDescription) ?? null;
  const amountStr = extractString(tx.getAuthAmount) ?? extractString(tx.getSettleAmount) ?? null;
  const amount = amountStr !== null ? Number(amountStr) : null;
  const payment = tx.getPayment?.();
  const cc = payment?.getCreditCard?.();
  const masked = extractString(cc?.getCardNumber) ?? '';
  const cardLastFour = masked ? masked.replace(/\D/g, '').slice(-4) || null : null;
  const cardBrand = extractString(cc?.getCardType) ?? null;
  const avs = extractString(tx.getAVSResponse) ?? null;
  const cvv = extractString(tx.getCardCodeResponse) ?? null;

  return {
    raw: apiResponse,
    approved: responseCode === '1',
    responseCode,
    responseReason,
    authCode,
    amount,
    cardLastFour,
    cardBrand,
    avs,
    cvv,
  };
}

function extractString(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'function') {
    try {
      const r = (v as () => unknown)();
      return typeof r === 'string' ? r : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function main() {
  const args = parseArgs();

  console.log('==================================================');
  console.log(`  ORDER PAYMENT BACKFILL  ${args.dryRun ? '(DRY RUN)' : '(WRITE)'}`);
  console.log('==================================================');
  console.log(`Target order: ${args.orderNumber}`);

  const { order, payments } = await fetchOrderByNumber(args.orderNumber);
  const o = order as {
    id: string;
    order_number: string;
    status: string;
    total: number | string;
    customer_email: string;
    created_at: string;
  };

  console.log(`  id:          ${o.id}`);
  console.log(`  status:      ${o.status}`);
  console.log(`  total:       $${Number(o.total).toFixed(2)}`);
  console.log(`  payments:    ${payments.length}`);
  console.log('');

  if (o.status !== 'pending') {
    console.error(`Refusing to backfill — order status is '${o.status}' (need 'pending').`);
    process.exit(2);
  }
  if (payments.length > 0) {
    console.error(`Refusing to backfill — ${payments.length} payment row(s) already exist.`);
    for (const p of payments as Array<{ id: string; status: string; authnet_transaction_id: string | null }>) {
      console.error(`  ${p.id} · ${p.status} · txn ${p.authnet_transaction_id ?? 'null'}`);
    }
    process.exit(2);
  }

  const txnId = args.explicitTransactionId ?? (await findTransactionIdByRefId(o.order_number));
  if (!txnId) {
    console.error(
      `Could not locate Auth.net transaction for refId=${o.order_number}. ` +
        `Re-run with --transaction-id <id>.`,
    );
    process.exit(3);
  }
  console.log(`Auth.net transaction: ${txnId}`);

  const details = await fetchTransactionDetails(txnId);
  console.log(`  approved:    ${details.approved}`);
  console.log(`  amount:      $${details.amount?.toFixed(2) ?? 'unknown'}`);
  console.log(`  card:        ${details.cardBrand ?? '?'} …${details.cardLastFour ?? '????'}`);
  console.log(`  responseReason: ${details.responseReason ?? '(none)'}`);
  console.log('');

  if (!details.approved) {
    console.error(`Auth.net reports this transaction was not approved (responseCode=${details.responseCode}). Not backfilling.`);
    process.exit(4);
  }

  if (details.amount !== null && Math.abs(details.amount - Number(o.total)) > 0.01) {
    console.error(
      `Amount mismatch: Auth.net reports $${details.amount.toFixed(2)} but order total is $${Number(
        o.total,
      ).toFixed(2)}. Not backfilling.`,
    );
    process.exit(5);
  }

  const amountCents = Math.round(Number(o.total) * 100);

  console.log('Intended writes:');
  console.log(`  INSERT payments (order_id=${o.id}, status=succeeded, txn=${txnId}, amount=${o.total})`);
  console.log(`  UPDATE orders.status = 'paid' WHERE id = ${o.id}`);
  console.log(`  INSERT payment_audit_log (event_type='manual_backfill', source='manual_backfill_phase4_silent_failure_fix')`);
  console.log('');

  if (args.dryRun) {
    console.log('(dry run — no writes)');
    return;
  }

  const admin = supaAdmin();

  const { error: insErr } = await admin.from('payments').insert({
    order_id: o.id,
    type: 'auth_capture',
    amount: Number(o.total),
    status: 'succeeded',
    authnet_transaction_id: txnId,
    authnet_response_code: details.responseCode,
    authnet_response_reason: details.responseReason,
    authnet_avs_result: details.avs,
    authnet_cvv_result: details.cvv,
    fraud_held: false,
    fraud_reason: null,
    card_last_four: details.cardLastFour,
    card_brand: details.cardBrand,
    raw_response: safeJson(details.raw),
  });
  if (insErr) {
    fatal('payments insert failed', insErr);
  }

  const { error: updErr } = await admin.from('orders').update({ status: 'paid' }).eq('id', o.id);
  if (updErr) fatal('orders update failed', updErr);

  const { error: auditErr } = await admin.from('payment_audit_log').insert({
    order_id: o.id,
    event_type: 'manual_backfill',
    transaction_id: txnId,
    amount_cents: amountCents,
    raw_response: safeJson(details.raw),
    error_detail: null,
    source: 'manual_backfill_phase4_silent_failure_fix',
  });
  if (auditErr) fatal('payment_audit_log insert failed', auditErr);

  console.log('Backfill complete.');
}

function fatal(message: string, err: unknown): never {
  console.error(message, err);
  try {
    fs.writeFileSync('/tmp/backfill-error.log', `${message}\n${String((err as Error)?.stack ?? err)}`);
  } catch {}
  process.exit(10);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
