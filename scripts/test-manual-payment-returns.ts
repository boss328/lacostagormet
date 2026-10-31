import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import { NextRequest } from 'next/server';

const require = createRequire(import.meta.url);
const origin = 'https://checkout.test';
const order = { id: '11111111-1111-4111-8111-111111111111', order_number: 'LCG-123', status: 'pending', source: 'manual', total: '39.98' };
const tx = {
  invoiceNumber: order.order_number, refId: order.order_number, amount: 39.98,
  transactionType: 'authCaptureTransaction', transactionStatus: 'capturedPendingSettlement',
  authAmount: 39.98, settleAmount: 39.98, responseCode: '1', transId: 'test-transaction',
};

function load(path: string, modules: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const target = { exports: {} as Record<string, Function> };
  new Function('require', 'module', 'exports', ...Object.keys(globals), compiled)((key: string) => {
    if (key === 'server-only') return {};
    if (key === 'next/server') return require(key);
    assert.ok(key in modules, 'Unmocked dependency ' + key);
    return modules[key];
  }, target, target.exports, ...Object.values(globals));
  return target.exports;
}

function fixture() {
  const writes: { table: string; row: Record<string, unknown> }[] = [];
  const reads: string[] = [];
  const filters: string[] = [];
  let verifyCalls = 0;
  const state = { order: { ...order }, outcome: 'no_transaction', lookupOk: true, transaction: { ...tx } };
  const admin = { from(table: string) {
    return {
      select(fields: string) { reads.push(table); if (table === 'orders') assert.match(fields, /source/); return this; },
      eq() { return this; },
      or(filter: string) { filters.push(filter); return this; },
      maybeSingle() {
        const scope = filters.at(-1);
        const hasGrant = scope?.includes(`and(id.eq.${order.id},total.eq.39.98)`);
        return { data: scope && !hasGrant && state.order.source === 'manual' ? null : state.order };
      },
      insert(row: Record<string, unknown>) { writes.push({ table, row }); return { error: null }; },
      update(row: Record<string, unknown>) {
        writes.push({ table, row });
        return { eq() { return this; }, select() { return { data: [{ id: order.id }], error: null }; } };
      },
    };
  } };
  const finalizer = load('../src/lib/checkout/finalize-payment.ts', {
    '@/lib/authnet/safe-json': { safeJson: (value: unknown) => value },
    '@/lib/admin/vendor-po': { autoDraftVendorPosForOrder() {} },
    '@/lib/email/notify-order-placed': { notifyOrderPlaced() {} },
  });
  const shared = {
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/checkout/manual-payment-grant': { MANUAL_PAYMENT_COOKIE: 'manual', verifyManualPaymentGrant: (token: string) =>
      token === 'owner' ? { orderId: order.id, amountCents: 3998 } : null },
    '@/lib/checkout/verify-pending-payment': { verifyPendingOrderPayment: () => { verifyCalls++; return { outcome: state.outcome }; } },
  };
  const callback = load('../src/app/api/checkout/hosted-callback/route.ts', {
    ...shared, '@/lib/checkout/finalize-payment': finalizer, '@/lib/authnet/safe-json': { safeJson: () => null },
    '@/lib/authnet/hosted': { fetchTransactionDetails: () => ({ ok: state.lookupOk, details: state.transaction }) },
  });
  const poll = load('../src/app/api/checkout/payment-status/route.ts', shared);
  return { state, reads, writes, filters, get verifyCalls() { return verifyCalls; },
    settle: (patch: Record<string, unknown>) => finalizer.finalizeOrderPayment({
      order: state.order, admin, tx: { ...tx, ...patch }, source: 'fixture',
    }),
    async callback(withTransaction: boolean, cookie = 'owner') {
      const request = new NextRequest(`${origin}/api/checkout/hosted-callback/?orderNumber=${order.order_number}`, {
        method: withTransaction ? 'POST' : 'GET', headers: { cookie: 'manual=' + cookie, host: 'checkout.test' },
        body: withTransaction ? new URLSearchParams({ transId: tx.transId }) : undefined,
      });
      const response = await callback[withTransaction ? 'POST' : 'GET'](request);
      assert.equal(response.status, 303);
      return new URL(response.headers.get('location'));
    },
    poll: (cookie: string) => poll.POST(new NextRequest(origin + '/api/checkout/payment-status/', {
      method: 'POST', headers: { cookie: 'manual=' + cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ orderNumber: order.order_number }),
    })),
  };
}

test('manual payment requires a matching gateway invoice and exact whole-cent balance', async () => {
  const h = fixture();
  for (const invoiceNumber of [null, '', 'LCG-999']) {
    assert.equal((await h.settle({ invoiceNumber })).outcome, 'refid_mismatch');
  }
  for (const settleAmount of [null, NaN, 39.97, 39.99, 39.981]) {
    assert.equal((await h.settle({ settleAmount })).outcome, 'amount_mismatch');
  }
  assert.equal(h.writes.filter(w => w.table !== 'payment_audit_log').length, 0);
  assert.equal((await h.settle({})).orderStatus, 'paid');
  assert.equal((await h.settle({ transactionStatus: 'settledSuccessfully' })).orderStatus, 'paid');
  assert.equal(h.writes.find(w => w.table === 'payments')?.row.amount, 39.98);
});

test('only captured sales can mark an unpaid manual order paid', async () => {
  const h = fixture();
  for (const transactionType of [null, 'authOnlyTransaction', 'refundTransaction', 'voidTransaction']) {
    assert.equal((await h.settle({ transactionType })).outcome, 'transaction_unconfirmed');
  }
  for (const transactionStatus of [null, 'unknown', 'authorizedPendingCapture', 'voided', 'refundSettledSuccessfully', 'FDSAuthorizedPendingReview']) {
    assert.equal((await h.settle({ transactionStatus })).outcome, 'transaction_unconfirmed');
  }
  assert.ok(h.writes.every(w => w.table === 'payment_audit_log'));
});

test('fraud review requires a review status and matching authorization amount', async () => {
  const h = fixture();
  for (const transactionStatus of ['FDSPendingReview', 'FDSAuthorizedPendingReview']) {
    const held = { responseCode: '4', transactionStatus, settleAmount: null };
    for (const authAmount of [null, 39.97]) {
      assert.equal((await h.settle({ ...held, authAmount })).outcome, 'amount_mismatch');
    }
    assert.equal((await h.settle(held)).orderStatus, 'payment_held');
  }
  assert.equal((await h.settle({ responseCode: '4', transactionStatus: 'settledSuccessfully' })).outcome, 'transaction_unconfirmed');
  assert.ok(h.writes.filter(w => w.table === 'payments').every(w => w.row.status === 'held_for_review'));
});

test('gateway parsing preserves the separate authorization and settlement amounts', async () => {
  const gatewayTx = { ...tx, transactionStatus: 'settledSuccessfully', authAmount: '39.9800', settleAmount: '20.0000' };
  const gateway = load('../src/lib/authnet/hosted.ts', {
    '@/lib/authnet/environment': { resolveAuthnetEnv: () => 'sandbox', apiEndpoint: () => 'https://test.invalid' },
    '@/lib/authnet/pick-transaction': {},
  }, {
    process: { env: { AUTHNET_API_LOGIN_ID: 'fixture', AUTHNET_TRANSACTION_KEY: 'fixture' } },
    fetch: async () => ({ text: async () => JSON.stringify({ messages: { resultCode: 'Ok' }, transaction: gatewayTx }) }),
  });
  const { details } = await gateway.fetchTransactionDetails(tx.transId);
  assert.equal(details.transactionType, 'authCaptureTransaction');
  assert.equal(details.transactionStatus, 'settledSuccessfully');
  assert.equal(details.amount, 39.98);
  assert.equal(details.authAmount, 39.98);
  assert.equal(details.settleAmount, 20);
  gatewayTx.settleAmount = '39.980000000000000001';
  assert.equal((await gateway.fetchTransactionDetails(tx.transId)).details.settleAmount, null);
});

test('manual declines and provider errors leave the saved order and stock pending', async () => {
  const h = fixture();
  assert.equal((await h.settle({ responseCode: '2', transactionStatus: 'declined', settleAmount: null })).outcome, 'declined');
  assert.equal((await h.settle({ responseCode: '3', transactionStatus: 'generalError' })).outcome, 'transaction_unconfirmed');
  assert.equal((await h.settle({ responseCode: '2', transactionStatus: null })).outcome, 'transaction_unconfirmed');
  assert.deepEqual(h.reads, []);
  assert.ok(h.writes.every(w => w.table === 'payment_audit_log'));
});

test('all known manual callback outcomes return to the matching private review', async () => {
  const h = fixture();
  for (const outcome of ['declined', 'refid_mismatch', 'amount_mismatch', 'transaction_unconfirmed', 'lookup_failed', 'no_transaction', 'finalized', 'already_final']) {
    h.state.outcome = outcome;
    const url = await h.callback(false);
    assert.equal(url.pathname, '/pay/');
    assert.equal(url.searchParams.get('order'), order.order_number);
    if (['no_transaction', 'finalized', 'already_final'].includes(outcome)) assert.equal(url.searchParams.get('returned'), '1');
    else assert.ok(url.searchParams.get('error'));
  }
  h.state.transaction.responseCode = '2';
  h.state.transaction.transactionStatus = 'declined';
  assert.equal((await h.callback(true)).searchParams.get('error'), 'declined');
  h.state.lookupOk = false;
  assert.equal((await h.callback(true)).searchParams.get('error'), 'callback-lookup-failed');
  assert.equal((await h.callback(true, 'wrong')).searchParams.get('error'), 'link');
});

test('manual polling requires the grant for the saved order and amount before any gateway lookup', async () => {
  const h = fixture();
  const blocked = await h.poll('wrong');
  assert.equal(blocked.status, 404);
  assert.equal(h.verifyCalls, 0);
  h.state.outcome = 'declined';
  const allowed = await h.poll('owner');
  assert.deepEqual(await allowed.json(), { status: 'pending', manualPaymentError: 'declined' });
  assert.equal(h.verifyCalls, 1);
});
