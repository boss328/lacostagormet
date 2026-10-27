import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import { checkoutCreateSchema } from '../src/lib/checkout/validate';
import { cartHash } from '../src/lib/checkout/cart-hash';
import * as availability from '../src/lib/product-availability';

const require = createRequire(import.meta.url);
const productId = '11111111-1111-4111-8111-111111111111';
const orderId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const vendorId = '44444444-4444-4444-8444-444444444444';
const origin = 'https://inventory-checkout.test';
const address = { firstName: 'Test', lastName: 'Customer', address1: '123 Fixture St', city: 'Carlsbad', state: 'CA', zip: '92008', phone: '5555555555' };
const payload = { email: 'test@example.test', shippingAddress: address, clientSubtotal: 36, items: [{ product_id: productId, quantity: 2 }] };
type Row = Record<string, any>;
type Write = { table: string; operation: string; values?: Row | Row[]; filters: Array<[string, unknown]> };

function evaluate(file: string, modules: Record<string, unknown>): Record<string, (...args: any[]) => Promise<any>> {
  const compiled = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const target = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((name: string) => {
    if (!(name in modules)) throw new Error(`Unmocked checkout inventory boundary ${name}`);
    return modules[name];
  }, target, target.exports);
  return target.exports;
}

function harness() {
  const product = { id: productId, sku: 'CAN-1', name: 'One canister', retail_price: 18, wholesale_cost: null,
    preferred_vendor_id: vendorId, is_active: true, stock_status: 'in_stock', deleted_at: null };
  const order: Row = { id: orderId, order_number: 'LCG-INVENTORY', status: 'pending', total: 36, source: null, admin_notes: null };
  const state = {
    writes: [] as Write[], rpcCalls: [] as Array<{ name: string; args: Row }>,
    itemError: { code: 'P0001', message: 'Inventory: insufficient available stock for CAN-1' } as { code: string; message: string } | null,
    rpcError: { code: 'P0001', message: 'Inventory: insufficient available stock for CAN-1' } as { code: string; message: string } | null,
    providerCalls: 0, emails: 0, recent: false, preview: false, token: 'admin-token', cancelRace: false,
    reserved: true, allocationError: null as null | { code: string; message: string },
    allocationQueries: [] as Array<{ filters: Array<[string, unknown]>; limit: number | null }>,
  };
  const client = {
    from(table: string) {
      let single = false;
      let columns = '';
      let limit: number | null = null;
      const write: Write = { table, operation: 'select', filters: [] };
      const query = {
        select(value = '') { columns = value; return query; },
        eq(key: string, value: unknown) { write.filters.push([key, value]); return query; },
        in() { return query; }, is() { return query; }, gte() { return query; }, order() { return query; }, limit(value: number) { limit = value; return query; },
        single() { single = true; return query; }, maybeSingle() { single = true; return query; },
        insert(values: Row | Row[]) { write.operation = 'insert'; write.values = values; return query; },
        update(values: Row) { write.operation = 'update'; write.values = values; return query; },
        delete() { write.operation = 'delete'; return query; },
        then(resolve: (value: unknown) => void) {
          if (write.operation !== 'select') state.writes.push(write);
          let data: Row[] = [];
          let error = null;
          if (table === 'products') data = [Object.fromEntries(columns.split(',').map(key => [key.trim(), product[key.trim() as keyof typeof product]]))];
          if (table === 'orders') {
            if (write.operation === 'insert') data = [{ ...order, status: (write.values as Row).status }];
            else if (write.operation === 'update') {
              const matches = write.filters.every(([key, value]) => order[key] === value);
              data = state.cancelRace || !matches ? [] : [{ id: orderId }];
              if (data.length) Object.assign(order, write.values);
            }
            else if (write.operation === 'select' && (single || state.recent)) data = [{ ...order }];
          }
          if (table === 'order_items' && write.operation === 'insert') error = state.itemError;
          if (table === 'inventory_order_allocations') {
            state.allocationQueries.push({ filters: write.filters, limit });
            data = state.reserved ? [{ order_item_id: 'reserved-line' }] : [];
            error = state.allocationError;
          }
          resolve({ data: error ? null : single ? data[0] ?? null : data, error });
        },
      };
      return query;
    },
    async rpc(name: string, args: Row) {
      state.rpcCalls.push({ name, args });
      return { error: state.rpcError, data: state.rpcError ? null : { id: requestId, order_id: orderId, order_number: order.order_number,
        status: 'pending', method: args.p_method, environment: 'sandbox', total: 36, created_at: new Date().toISOString(), provider_order_id: null } };
    },
  };
  const config = () => ({ paypal: true, apple_pay: true, amazon_pay: true, environment: 'sandbox' });
  const modules: Record<string, unknown> = {
    'server-only': {}, 'next/server': require('next/server'), 'node:crypto': require('node:crypto'), zod: require('zod'),
    '@/lib/product-availability': availability, '@/lib/supabase/admin': { createAdminClient: () => client },
    '@/lib/checkout/validate': { checkoutCreateSchema }, '@/lib/checkout/cart-hash': { cartHash },
    '@/lib/checkout/pricing': { computeShipping: () => 0, loadShippingSettings: async () => ({}), round2: (v: number) => Math.round(v * 100) / 100, centsEqual: (a: number, b: number) => a === b },
    '@/lib/authnet/hosted': { getHostedPaymentToken: async () => { state.providerCalls++; return { ok: true, formToken: 'fixture', hostedUrl: origin }; } },
    '@/lib/admin/session': { ADMIN_COOKIE: 'fixture-admin', expectedSessionToken: async () => state.token },
    '@/lib/preview-mode': { isReadOnlyPreview: () => state.preview },
    '@/lib/email/notify-order-placed': { notifyOrderPlaced: async () => { state.emails++; } },
    '@/lib/analytics/ga-measurement-protocol': { sendGa4RefundEvent: async () => {} },
    './config': { walletConfig: config }, '@/lib/wallets/config': { walletConfig: config },
  };
  const card = evaluate('../src/app/api/checkout/create/route.ts', modules);
  const wallet = evaluate('../src/lib/wallets/prepare.ts', modules);
  const walletRoute = evaluate('../src/app/api/checkout/wallet/create/route.ts', {
    ...modules, '@/lib/wallets/prepare': wallet,
    '@/lib/wallets/paypal': { createPayPalOrder: async () => { state.providerCalls++; return { id: 'provider-order' }; } },
    '@/lib/wallets/amazon': { amazonButtonConfig: () => { state.providerCalls++; return {}; } },
    '@/lib/wallets/session': { sameOrigin: () => true, attemptProof: () => 'proof', cookieName: () => 'attempt', bindProviderOrder: async (attempt: Row, id: string) => ({ ...attempt, provider_order_id: id }) },
  });
  const manual = evaluate('../src/app/api/admin/orders/create/route.ts', modules);
  const finalizer = evaluate('../src/lib/wallets/finalize.ts', {
    ...modules,
    '@/lib/admin/vendor-po': { autoDraftVendorPosForOrder: async () => {} },
    './paypal': {
      getPayPalOrder: async () => ({ status: 'APPROVED' }),
      capturePayPalOrder: async () => { state.providerCalls++; },
    },
    './amazon': {
      getAmazonSession: async () => ({ statusDetails: { state: 'Open' } }),
      getAmazonCharge: async () => ({}),
      completeAmazonPayment: async () => { state.providerCalls++; },
    },
    './verification': {
      verifyPayPalOrder() {}, verifyPayPalCapture: () => null,
      verifyAmazonSession() {}, verifyAmazonCharge: () => null,
    },
  });
  const cardFinalizer = evaluate('../src/lib/checkout/finalize-payment.ts', {
    ...modules,
    '@/lib/authnet/safe-json': { safeJson: (value: unknown) => value },
    '@/lib/admin/vendor-po': { autoDraftVendorPosForOrder: async () => {} },
  });
  function request(path: string, data: unknown, opts: { token?: string; requestOrigin?: string } = {}) {
    return new NextRequest(`${origin}${path}`, { method: 'POST',
      headers: { 'content-type': 'application/json', origin: opts.requestOrigin ?? origin, cookie: `fixture-admin=${opts.token ?? 'admin-token'}; lcg-wallet-owner=${'a'.repeat(64)}` }, body: JSON.stringify(data) });
  }
  return { state, product, order,
    finalizeCard: (responseCode = '1', snapshot: Row = { ...order }) => cardFinalizer.finalizeOrderPayment({ admin: client, order: snapshot,
      tx: { refId: order.order_number, transId: 'fixture-transaction', amount: 36, responseCode,
        responseReason: responseCode === '2' ? 'Declined' : null, accountNumber: 'XXXX1111', accountType: 'Visa',
        avsResultCode: null, cvvResultCode: null, raw: {} }, source: 'inventory_fixture' }),
    card: () => card.POST(request('/api/checkout/create/', payload)),
    wallet: (method = 'paypal') => walletRoute.POST(request('/api/checkout/wallet/create/', { ...payload, method, requestId })),
    prepare: (method = 'paypal') => wallet.prepareWalletAttempt({ ...payload, method, requestId }, '127.0.0.1', 'a'.repeat(64)),
    manual: (paid = true) => manual.POST(request('/api/admin/orders/create/', { customerEmail: payload.email, shippingAddress: address,
      items: [{ productId, quantity: 2 }], markAsPaid: paid, sendCustomerEmail: true })),
    capture: (method: string) => finalizer.reconcileWalletPayment({ id: requestId, order_id: orderId,
      order_number: order.order_number, method, environment: 'sandbox', total: 36, provider_order_id: 'provider-order',
      status: 'pending', created_at: new Date().toISOString() }, true),
    cancel: async (body: unknown = { paymentClosed: true }, opts: { token?: string; requestOrigin?: string } = {}) => {
      const cancel = evaluate('../src/app/api/admin/orders/[orderNumber]/cancel/route.ts', modules);
      return cancel.POST(request(`/api/admin/orders/${order.order_number}/cancel/`, body, opts), { params: { orderNumber: order.order_number } });
    },
  };
}

test('card checkout rejects a database stock shortage before payment and removes the empty order', async () => {
  const h = harness();
  const result = await h.card();
  assert.equal(result.status, 409);
  assert.match((await result.json()).errorMessage, /not enough stock/);
  assert.equal(h.state.providerCalls, 0);
  const cleanup = h.state.writes.find(write => write.operation === 'delete')!;
  assert.equal(cleanup.table, 'orders');
  assert.deepEqual(cleanup.filters, [['id', orderId]]);
  const lines = h.state.writes.find(write => write.table === 'order_items')!.values as Row[];
  assert.equal(lines[0].product_id, productId);
  assert.equal(lines[0].quantity, 2);
});

test('card storage failures remain server errors, not false stock shortages', async () => {
  const h = harness();
  h.state.itemError = { code: 'unexpected', message: 'private storage failure' };
  const result = await h.card();
  assert.equal(result.status, 500);
  assert.equal(JSON.stringify(await result.json()).includes('private storage failure'), false);
  assert.equal(h.state.providerCalls, 0);
});

test('retrying a pending card order does not reserve its existing lines a second time', async () => {
  const h = harness();
  h.state.recent = true;
  assert.equal((await h.card()).status, 200);
  assert.equal(h.state.writes.filter(write => ['orders', 'order_items'].includes(write.table)).length, 0);
  assert.equal(h.state.providerCalls, 1);
});

for (const method of ['paypal', 'apple_pay', 'amazon_pay']) {
  test(`${method} database shortage prevents provider setup and returns a useful cart error`, async () => {
    const h = harness();
    const result = await h.wallet(method);
    assert.equal(result.status, 409);
    assert.match((await result.json()).error, /not enough stock/);
    assert.equal(h.state.providerCalls, 0);
    assert.equal(h.state.rpcCalls.length, 1);
    assert.equal(h.state.rpcCalls[0].name, 'prepare_wallet_checkout');
    assert.equal(h.state.rpcCalls[0].args.p_id, requestId);
    assert.equal(h.state.rpcCalls[0].args.p_items[0].quantity, 2);
  });
}

for (const responseCode of ['2', '3']) {
  test(`card ${responseCode === '2' ? 'decline' : 'provider error'} retains tracked stock while another hosted token may still pay`, async () => {
    const h = harness();
    assert.deepEqual(await h.finalizeCard(responseCode), { outcome: 'declined' });
    assert.equal(h.order.status, 'pending');
    assert.equal(h.state.writes.filter(write => write.table === 'orders').length, 0);
    assert.equal(h.state.writes.filter(write => write.table === 'payments').length, 0);
    assert.equal(h.state.emails, 0);
    assert.deepEqual(h.state.allocationQueries, [{ filters: [['order_id', orderId], ['state', 'reserved']], limit: 1 }]);
    assert.equal((h.state.writes[0].values as Row).event_type, responseCode === '2' ? 'auth_net_declined' : 'auth_net_error');
  });
}

test('a failed inventory lookup cannot release stock after a declined transaction', async () => {
  const h = harness();
  h.state.reserved = false;
  h.state.allocationError = { code: 'unexpected', message: 'inventory read unavailable' };
  assert.deepEqual(await h.finalizeCard('2'), { outcome: 'declined' });
  assert.equal(h.order.status, 'pending');
  assert.equal(h.state.writes.filter(write => write.table === 'orders').length, 0);
  assert.equal(h.state.emails, 0);
});

test('an untracked declined card order retains the existing conditional cancellation behavior', async () => {
  const h = harness();
  h.state.reserved = false;
  assert.deepEqual(await h.finalizeCard('2'), { outcome: 'declined' });
  assert.equal(h.order.status, 'cancelled');
  const cancellation = h.state.writes.find(write => write.table === 'orders')!;
  assert.deepEqual(cancellation.filters, [['id', orderId], ['status', 'pending']]);
  assert.deepEqual(cancellation.values, { status: 'cancelled' });
  assert.equal(h.state.emails, 0);
});

test('tracked decline followed by approval finalizes once without dropping the reserved order', async () => {
  const h = harness();
  const stalePendingSnapshot = { ...h.order };
  await h.finalizeCard('2');
  assert.equal(h.order.status, 'pending');
  assert.deepEqual(await h.finalizeCard('1'), { outcome: 'finalized', orderStatus: 'paid', paymentRecordFailed: false });
  assert.equal(h.order.status, 'paid');
  assert.deepEqual(await h.finalizeCard('1', stalePendingSnapshot), { outcome: 'already_final' });
  assert.equal(h.state.writes.filter(write => write.table === 'payments').length, 1);
  assert.equal(h.state.emails, 1);
  const claims = h.state.writes.filter(write => write.table === 'orders');
  assert.equal(claims.length, 2, 'the duplicate callback attempts the conditional claim but cannot win it');
  for (const claim of claims) assert.deepEqual(claim.filters, [['id', orderId], ['status', 'pending']]);
});

test('already-paid and payment-held callbacks do not write or notify again', async () => {
  const h = harness();
  for (const status of ['paid', 'payment_held']) {
    h.order.status = status;
    assert.deepEqual(await h.finalizeCard(), { outcome: 'already_final' });
  }
  assert.equal(h.state.writes.length, 0);
  assert.equal(h.state.allocationQueries.length, 0);
  assert.equal(h.state.emails, 0);
});

test('wallet storage failures do not reveal database details as customer stock errors', async () => {
  const h = harness();
  h.state.rpcError = { code: 'unexpected', message: 'private DB failure' };
  const result = await h.wallet();
  assert.equal(result.status, 400);
  assert.equal(JSON.stringify(await result.json()).includes('private DB failure'), false);
  assert.equal(h.state.providerCalls, 0);
});

for (const paid of [false, true]) {
  test(`manual ${paid ? 'paid' : 'pending'} order cannot bypass stock checks or notify after a shortage`, async () => {
    const h = harness();
    const result = await h.manual(paid);
    assert.equal(result.status, 409);
    assert.match((await result.json()).errorMessage, /not enough available stock/);
    assert.equal(h.state.emails, 0);
    assert.equal(h.state.providerCalls, 0);
    assert.deepEqual(h.state.writes.find(write => write.operation === 'delete')?.filters, [['id', orderId]]);
  });
}

test('cancellation requires admin access, same origin and a writable environment', async () => {
  const h = harness();
  assert.equal((await h.cancel({}, { token: 'wrong' })).status, 401);
  assert.equal((await h.cancel({}, { requestOrigin: 'https://external.test' })).status, 403);
  assert.equal((await h.cancel({}, { requestOrigin: '' })).status, 403);
  h.state.preview = true;
  assert.equal((await h.cancel()).status, 409);
  assert.equal(h.state.writes.length, 0);
});

test('storefront stock is not released by admin cancellation without explicit payment-closure confirmation', async () => {
  const h = harness();
  for (const value of [undefined, false, 'true']) {
    const response = await h.cancel({ paymentClosed: value });
    assert.equal(response.status, 409);
    assert.match((await response.json()).errorMessage, /payment provider/);
  }
  assert.equal(h.state.writes.length, 0);
  assert.equal((await h.cancel({ paymentClosed: true })).status, 200);
  const write = h.state.writes[0];
  assert.deepEqual(write.filters, [['id', orderId], ['status', 'pending']]);
  assert.match((write.values as Row).admin_notes, /provider payment is closed/);
});

test('manual pending orders can be cancelled without a payment-provider step', async () => {
  const h = harness();
  h.order.source = 'manual';
  assert.equal((await h.cancel({})).status, 200);
  assert.equal(h.state.writes.length, 1);
});

test('a concurrent payment transition prevents cancellation and preserves the paid order', async () => {
  const h = harness();
  h.state.cancelRace = true;
  const response = await h.cancel();
  assert.equal(response.status, 409);
  assert.match((await response.json()).errorMessage, /changed while/);
  assert.deepEqual(h.state.writes[0].filters, [['id', orderId], ['status', 'pending']]);
});

test('already paid and refunded orders cannot enter the cancellation stock-release path', async () => {
  const h = harness();
  for (const status of ['paid', 'refunded', 'partially_refunded', 'cancelled']) {
    h.order.status = status;
    assert.equal((await h.cancel()).status, 400);
  }
  assert.equal(h.state.writes.length, 0);
});

for (const method of ['paypal', 'apple_pay', 'amazon_pay']) {
  test(`${method} cannot capture money after an order is cancelled and its reservation released`, async () => {
    const h = harness();
    h.order.status = 'cancelled';
    await assert.rejects(h.capture(method), /no longer awaiting payment/);
    assert.equal(h.state.providerCalls, 0);
    assert.equal(h.state.rpcCalls.length, 0);
  });
  test(`${method} permits capture only while its existing order remains pending`, async () => {
    const h = harness();
    assert.equal(await h.capture(method), 'pending');
    assert.equal(h.state.providerCalls, 1);
  });
}
