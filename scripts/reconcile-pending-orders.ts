/**
 * scripts/reconcile-pending-orders.ts
 *
 * Batch reconciliation for the Apr–Aug 2026 stranded-checkout incident:
 * every storefront order stayed 'pending' because Auth.net's return trip
 * never reached the hosted callback. This script asks Auth.net which of
 * those orders were actually charged and repairs the ones that were.
 *
 * For every 'pending' LCG-% order with zero payments rows, it searches
 * Auth.net (unsettled transactions + settled batches over the window) for
 * transactions whose invoice/refId matches the order number, re-fetches
 * each match authoritatively, then:
 *
 *   approved (1) → payments row + orders.status 'paid'
 *   held     (4) → payments row + orders.status 'payment_held'
 *   declined-only matches → orders.status 'cancelled'
 *   no matching transaction → left untouched (customer never charged)
 *
 * Every write is logged to payment_audit_log (event 'manual_backfill' /
 * 'auth_net_declined', source 'reconciliation').
 *
 * NO EMAILS ARE SENT — months-late "order confirmed" emails would land as
 * noise or worse. Outreach for repaired orders is a human step; the
 * summary this script prints is the outreach list.
 *
 * Usage:
 *   pnpm tsx scripts/reconcile-pending-orders.ts                 # dry run
 *   pnpm tsx scripts/reconcile-pending-orders.ts --apply         # write
 *   pnpm tsx scripts/reconcile-pending-orders.ts --since 2026-04-19 --until 2026-08-08
 *
 * Credentials come from the environment first, then .env.local as a
 * fallback — so to reconcile PRODUCTION, export the production values
 * (AUTHNET_ENVIRONMENT=production, AUTHNET_API_LOGIN_ID,
 * AUTHNET_TRANSACTION_KEY, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY) before running. The banner prints which
 * Auth.net environment it is talking to; read it before trusting a run.
 */

import fs from 'node:fs';
import path from 'node:path';
import { APIContracts, APIControllers, Constants as SDKConstants } from 'authorizenet';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveAuthnetEnv } from '../src/lib/authnet/environment';
import { safeJson } from '../src/lib/authnet/safe-json';

type Args = { apply: boolean; since: string; until: string };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let apply = false;
  let since = '2026-04-19';
  let until = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') apply = true;
    else if (a === '--since') since = argv[++i] ?? since;
    else if (a === '--until') until = argv[++i] ?? until;
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return { apply, since, until };
}

/** Fill process.env from .env.local for any var not already exported. */
function loadEnvFallback(): void {
  const file = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const eq = line.indexOf('=');
    if (eq < 1 || line.trimStart().startsWith('#')) continue;
    const key = line.slice(0, eq).trim();
    if (!(key in process.env)) process.env[key] = line.slice(eq + 1).trim();
  }
}

function supaAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function authnetContext() {
  const env = resolveAuthnetEnv(process.env.AUTHNET_ENVIRONMENT);
  const endpoint =
    env === 'production' ? SDKConstants.endpoint.production : SDKConstants.endpoint.sandbox;
  const apiLoginId = process.env.AUTHNET_API_LOGIN_ID;
  const transactionKey = process.env.AUTHNET_TRANSACTION_KEY;
  if (!apiLoginId || !transactionKey) {
    throw new Error('Missing AUTHNET_API_LOGIN_ID / AUTHNET_TRANSACTION_KEY');
  }
  const merchantAuth = new APIContracts.MerchantAuthenticationType();
  merchantAuth.setName(apiLoginId);
  merchantAuth.setTransactionKey(transactionKey);
  return { env, merchantAuth, endpoint };
}

async function execPromise(ctrl: {
  execute: (cb: () => void) => void;
  getResponse: () => unknown;
}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    try {
      ctrl.execute(() => {
        try {
          resolve(ctrl.getResponse());
        } catch (e) {
          reject(e);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

type RawTxn = { transId?: string; refId?: string; invoiceNumber?: string; submitTimeUTC?: string };

async function listUnsettledTransactions(): Promise<RawTxn[]> {
  const { merchantAuth, endpoint } = authnetContext();
  const req = new APIContracts.GetUnsettledTransactionListRequest();
  req.setMerchantAuthentication(merchantAuth);
  const ctrl = new APIControllers.GetUnsettledTransactionListController(req.getJSON());
  ctrl.setEnvironment(endpoint);
  const raw = (await execPromise(ctrl)) as {
    messages?: { resultCode?: string };
    transactions?: { transaction?: RawTxn[] };
  };
  if (raw?.messages?.resultCode !== 'Ok') {
    console.error('[reconcile] unsettled-list non-Ok:', JSON.stringify(safeJson(raw)).slice(0, 300));
    return [];
  }
  return raw.transactions?.transaction ?? [];
}

/** Settled batch ids over [since, until], chunked to respect the API's 31-day window cap. */
async function listSettledBatches(since: string, until: string): Promise<string[]> {
  const { merchantAuth, endpoint } = authnetContext();
  const contracts = APIContracts as unknown as {
    GetSettledBatchListRequest: new () => {
      setMerchantAuthentication: (v: unknown) => void;
      setIncludeStatistics: (v: boolean) => void;
      setFirstSettlementDate: (v: string) => void;
      setLastSettlementDate: (v: string) => void;
      getJSON(): unknown;
    };
  };
  const controllers = APIControllers as unknown as {
    GetSettledBatchListController: new (json: unknown) => {
      setEnvironment: (e: string) => void;
      execute: (cb: () => void) => void;
      getResponse: () => unknown;
    };
  };

  const fmt = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const DAY = 24 * 60 * 60 * 1000;
  const start = new Date(`${since}T00:00:00Z`).getTime();
  const end = new Date(`${until}T23:59:59Z`).getTime();

  const ids: string[] = [];
  for (let winStart = start; winStart <= end; winStart += 30 * DAY) {
    const winEnd = Math.min(winStart + 30 * DAY - 1, end);
    const req = new contracts.GetSettledBatchListRequest();
    req.setMerchantAuthentication(merchantAuth);
    req.setIncludeStatistics(false);
    req.setFirstSettlementDate(fmt(new Date(winStart)));
    req.setLastSettlementDate(fmt(new Date(winEnd)));
    const ctrl = new controllers.GetSettledBatchListController(req.getJSON());
    ctrl.setEnvironment(endpoint);
    const raw = (await execPromise(ctrl)) as {
      messages?: { resultCode?: string };
      batchList?: { batch?: Array<{ batchId?: string }> };
    };
    if (raw?.messages?.resultCode !== 'Ok') {
      console.error(
        `[reconcile] settled-batch-list ${fmt(new Date(winStart))}..${fmt(new Date(winEnd))} non-Ok:`,
        JSON.stringify(safeJson(raw)).slice(0, 300),
      );
      continue;
    }
    for (const b of raw.batchList?.batch ?? []) if (b.batchId) ids.push(b.batchId);
  }
  return [...new Set(ids)];
}

async function listTransactionsInBatch(batchId: string): Promise<RawTxn[]> {
  const { merchantAuth, endpoint } = authnetContext();
  const contracts = APIContracts as unknown as {
    GetTransactionListRequest: new () => {
      setMerchantAuthentication: (v: unknown) => void;
      setBatchId: (id: string) => void;
      getJSON(): unknown;
    };
  };
  const controllers = APIControllers as unknown as {
    GetTransactionListController: new (json: unknown) => {
      setEnvironment: (e: string) => void;
      execute: (cb: () => void) => void;
      getResponse: () => unknown;
    };
  };
  const req = new contracts.GetTransactionListRequest();
  req.setMerchantAuthentication(merchantAuth);
  req.setBatchId(batchId);
  const ctrl = new controllers.GetTransactionListController(req.getJSON());
  ctrl.setEnvironment(endpoint);
  const raw = (await execPromise(ctrl)) as {
    messages?: { resultCode?: string };
    transactions?: { transaction?: RawTxn[] };
  };
  if (raw?.messages?.resultCode !== 'Ok') {
    console.error(`[reconcile] tx-list batch=${batchId} non-Ok:`, JSON.stringify(safeJson(raw)).slice(0, 300));
    return [];
  }
  return raw.transactions?.transaction ?? [];
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

type TxDetails = {
  transId: string;
  raw: unknown;
  responseCode: string | null;
  responseReason: string | null;
  amount: number | null;
  cardLastFour: string | null;
  cardBrand: string | null;
  avs: string | null;
  cvv: string | null;
};

async function fetchDetails(transactionId: string): Promise<TxDetails> {
  const { merchantAuth, endpoint } = authnetContext();
  const req = new APIContracts.GetTransactionDetailsRequest();
  req.setMerchantAuthentication(merchantAuth);
  req.setTransId(transactionId);
  const ctrl = new APIControllers.GetTransactionDetailsController(req.getJSON());
  ctrl.setEnvironment(endpoint);
  const apiResponse = await execPromise(ctrl);

  const response = new APIContracts.GetTransactionDetailsResponse(apiResponse as never);
  const resultCode = extractString(response.getMessages?.()?.getResultCode);
  if (resultCode !== 'Ok') {
    throw new Error(
      `getTransactionDetails(${transactionId}) non-Ok: ${JSON.stringify(safeJson(apiResponse)).slice(0, 300)}`,
    );
  }
  const tx = response.getTransaction?.();
  if (!tx) throw new Error(`getTransactionDetails(${transactionId}) returned no transaction`);

  const messages = tx.getMessages?.()?.getMessage?.();
  const amountStr = extractString(tx.getAuthAmount) ?? extractString(tx.getSettleAmount) ?? null;
  const cc = tx.getPayment?.()?.getCreditCard?.();
  const masked = extractString(cc?.getCardNumber) ?? '';
  return {
    transId: transactionId,
    raw: apiResponse,
    responseCode: extractString(tx.getResponseCode),
    responseReason: extractString(messages?.[0]?.getDescription) ?? null,
    amount: amountStr !== null ? Number(amountStr) : null,
    cardLastFour: masked ? masked.replace(/\D/g, '').slice(-4) || null : null,
    cardBrand: extractString(cc?.getCardType) ?? null,
    avs: extractString(tx.getAVSResponse) ?? null,
    cvv: extractString(tx.getCardCodeResponse) ?? null,
  };
}

type PendingOrder = {
  id: string;
  order_number: string;
  status: string;
  total: number | string;
  customer_email: string;
  created_at: string;
};

async function main() {
  loadEnvFallback();
  const args = parseArgs();
  const { env } = authnetContext();

  console.log('====================================================');
  console.log(`  PENDING-ORDER RECONCILIATION  ${args.apply ? '*** WRITE MODE ***' : '(dry run)'}`);
  console.log(`  Auth.net environment: ${env.toUpperCase()}`);
  console.log(`  Settled-batch window: ${args.since} .. ${args.until}`);
  console.log('====================================================\n');

  const admin = supaAdmin();

  const { data: pendingRaw, error: pendErr } = await admin
    .from('orders')
    .select('id, order_number, status, total, customer_email, created_at')
    .like('order_number', 'LCG-%')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (pendErr) throw new Error(`orders fetch failed: ${pendErr.message}`);
  const pending = (pendingRaw ?? []) as PendingOrder[];
  console.log(`Pending LCG orders: ${pending.length}`);
  if (pending.length === 0) return;

  // Safety: skip any order that somehow already has a payments row.
  const { data: payRows, error: payErr } = await admin
    .from('payments')
    .select('order_id')
    .in('order_id', pending.map((o) => o.id));
  if (payErr) throw new Error(`payments fetch failed: ${payErr.message}`);
  const alreadyRecorded = new Set((payRows ?? []).map((p) => (p as { order_id: string }).order_id));

  // Gather candidate transactions once, then match in memory.
  console.log('\nScanning Auth.net…');
  const unsettled = await listUnsettledTransactions();
  console.log(`  unsettled transactions: ${unsettled.length}`);
  const batches = await listSettledBatches(args.since, args.until);
  console.log(`  settled batches in window: ${batches.length}`);
  const all: RawTxn[] = [...unsettled];
  for (const batchId of batches) {
    const txns = await listTransactionsInBatch(batchId);
    all.push(...txns);
  }
  console.log(`  total candidate transactions: ${all.length}`);

  const byInvoice = new Map<string, RawTxn[]>();
  for (const t of all) {
    for (const key of [t.invoiceNumber, t.refId]) {
      if (!key) continue;
      const list = byInvoice.get(key) ?? [];
      if (!list.some((x) => x.transId === t.transId)) list.push(t);
      byInvoice.set(key, list);
    }
  }

  const summary = { repaired_paid: 0, repaired_held: 0, cancelled: 0, untouched: 0, skipped: 0 };
  const outreach: string[] = [];

  for (const order of pending) {
    const label = `${order.order_number}  $${Number(order.total).toFixed(2)}  ${order.customer_email}  (${order.created_at.slice(0, 10)})`;

    if (alreadyRecorded.has(order.id)) {
      console.log(`\nSKIP    ${label}\n        has a payments row despite status=pending — inspect by hand`);
      summary.skipped++;
      continue;
    }

    const matches = byInvoice.get(order.order_number) ?? [];
    if (matches.length === 0) {
      console.log(`\n—       ${label}\n        no Auth.net transaction; customer was never charged`);
      summary.untouched++;
      continue;
    }

    // Authoritative details per match; best outcome wins.
    const details: TxDetails[] = [];
    for (const m of matches) {
      if (!m.transId) continue;
      try {
        details.push(await fetchDetails(m.transId));
      } catch (e) {
        console.error(`        detail fetch failed for tx ${m.transId}:`, (e as Error).message);
      }
    }
    const approvedTx = details.find((d) => d.responseCode === '1');
    const heldTx = details.find((d) => d.responseCode === '4');
    const winner = approvedTx ?? heldTx;

    if (!winner) {
      const reasons = details.map((d) => `${d.transId}:${d.responseCode}`).join(', ') || '(none fetchable)';
      console.log(`\nCANCEL  ${label}\n        matches were all declined/errored [${reasons}]`);
      if (args.apply) {
        await admin
          .from('orders')
          .update({ status: 'cancelled' })
          .eq('id', order.id)
          .eq('status', 'pending');
        await admin.from('payment_audit_log').insert({
          order_id: order.id,
          event_type: 'auth_net_declined',
          transaction_id: details[0]?.transId ?? null,
          amount_cents: Math.round(Number(order.total) * 100),
          error_detail: `reconciliation: all matches declined [${reasons}]`,
          source: 'reconciliation',
        });
      }
      summary.cancelled++;
      continue;
    }

    const nextStatus = winner === approvedTx ? 'paid' : 'payment_held';
    const amountNote =
      winner.amount !== null && Math.abs(winner.amount - Number(order.total)) > 0.01
        ? `  ⚠ AMOUNT MISMATCH authnet=$${winner.amount} order=$${Number(order.total).toFixed(2)} — NOT written, inspect by hand`
        : '';
    console.log(`\n${nextStatus === 'paid' ? 'PAID   ' : 'HELD   '} ${label}\n        tx ${winner.transId} responseCode=${winner.responseCode}${amountNote}`);

    if (amountNote) {
      summary.skipped++;
      continue;
    }

    if (args.apply) {
      const { error: insErr } = await admin.from('payments').insert({
        order_id: order.id,
        type: 'auth_capture',
        amount: Number(order.total),
        status: nextStatus === 'paid' ? 'succeeded' : 'held_for_review',
        authnet_transaction_id: winner.transId,
        authnet_response_code: winner.responseCode,
        authnet_response_reason: winner.responseReason,
        authnet_avs_result: winner.avs,
        authnet_cvv_result: winner.cvv,
        fraud_held: nextStatus !== 'paid',
        fraud_reason: nextStatus !== 'paid' ? winner.responseReason : null,
        card_last_four: winner.cardLastFour,
        card_brand: winner.cardBrand,
        raw_response: safeJson(winner.raw),
      });
      if (insErr && insErr.code !== '23505') {
        console.error(`        payments insert FAILED: ${insErr.message} — order left untouched`);
        summary.skipped++;
        continue;
      }
      await admin
        .from('orders')
        .update({ status: nextStatus })
        .eq('id', order.id)
        .eq('status', 'pending');
      await admin.from('payment_audit_log').insert({
        order_id: order.id,
        event_type: 'manual_backfill',
        transaction_id: winner.transId,
        amount_cents: Math.round(Number(order.total) * 100),
        raw_response: safeJson(winner.raw),
        error_detail: `reconciliation: pending → ${nextStatus}`,
        source: 'reconciliation',
      });
    }
    if (nextStatus === 'paid') summary.repaired_paid++;
    else summary.repaired_held++;
    outreach.push(label);
  }

  console.log('\n====================================================');
  console.log('  SUMMARY');
  console.log(`    charged & repaired → paid:         ${summary.repaired_paid}`);
  console.log(`    charged & repaired → payment_held: ${summary.repaired_held}`);
  console.log(`    declined-only → cancelled:         ${summary.cancelled}`);
  console.log(`    never charged (untouched):         ${summary.untouched}`);
  console.log(`    skipped (inspect by hand):         ${summary.skipped}`);
  if (!args.apply) console.log('\n  Dry run — nothing was written. Re-run with --apply.');
  if (outreach.length) {
    console.log('\n  NO EMAILS WERE SENT. These customers were charged and');
    console.log('  need human outreach (they never got a confirmation):');
    for (const line of outreach) console.log(`    ${line}`);
  }
  console.log('====================================================');
}

main().catch((e) => {
  console.error('\nFATAL:', e);
  process.exit(1);
});
