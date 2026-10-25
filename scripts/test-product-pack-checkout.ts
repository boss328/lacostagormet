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
const caseId = '11111111-1111-4111-8111-111111111111';
const singleId = '22222222-2222-4222-8222-222222222222';
const localVendor = '33333333-3333-4333-8333-333333333333';
const supplierVendor = '44444444-4444-4444-8444-444444444444';
const origin = 'https://pack-checkout.test';
const payload = {
  email: 'fixture@example.test', clientSubtotal: 0.01,
  shippingAddress: { firstName: 'Test', lastName: 'Customer', address1: '123 Fixture St', city: 'Carlsbad', state: 'CA', zip: '92008', phone: '5555555555' },
  items: [
    { product_id: singleId, quantity: 2, unit_price: 0.01, units_per_pack: 100 },
    { product_id: caseId, quantity: 1, unit_price: 0.01, units_per_pack: 1 },
  ],
};
type Row = Record<string, unknown>;

function evaluate(file: string, modules: Record<string, unknown>): Record<string, (...args: any[]) => Promise<any>> {
  const compiled = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected boundary ${name}`);
    return modules[name];
  }, module, module.exports);
  return module.exports;
}

function harness() {
  const rows: Row[] = [
    { id: caseId, sku: 'CHAI-CASE', name: 'Chai — 4 bags', retail_price: '188.95', wholesale_cost: '100.00', preferred_vendor_id: supplierVendor,
      pack_parent_id: null, units_per_pack: 4, is_active: true, deleted_at: null, stock_status: 'in_stock' },
    { id: singleId, sku: 'CHAI-SINGLE', name: 'Chai — 1 bag', retail_price: '51.96', wholesale_cost: null, preferred_vendor_id: localVendor,
      pack_parent_id: caseId, units_per_pack: 1, is_active: true, deleted_at: null, stock_status: 'in_stock' },
  ];
  const state = {
    writes: [] as Array<{ table: string; values: Row | Row[] }>,
    rpc: null as null | { name: string; args: Row }, providerAmount: null as number | null,
  };
  const client = {
    from(table: string) {
      let columns = '';
      let ids: string[] = [];
      let write = false;
      let single = false;
      const query = {
        select(value = '') { columns = value; return query; },
        in(key: string, value: string[]) { assert.equal(key, 'id'); ids = value; return query; },
        eq() { return query; }, gte() { return query; }, order() { return query; }, limit() { return query; },
        single() { single = true; return query; },
        insert(values: Row | Row[]) { write = true; state.writes.push({ table, values }); return query; },
        then(resolve: (result: unknown) => void) {
          let data: Row[] = [];
          if (table === 'products') {
            data = rows.filter(row => ids.includes(row.id as string))
              .map(row => Object.fromEntries(columns.split(',').map(key => [key.trim(), row[key.trim()]])));
          } else if (table === 'orders' && write) {
            data = [{ id: 'fixture-order', order_number: 'LCG-FIXTURE', status: 'pending', total: 292.87 }];
          }
          resolve({ data: single ? data[0] ?? null : data, error: null });
        },
      };
      return query;
    },
    async rpc(name: string, args: Row) {
      state.rpc = { name, args };
      return { data: { id: 'fixture-attempt', status: 'prepared' }, error: null };
    },
  };
  const modules = {
    'server-only': {}, 'next/server': require('next/server'), 'node:crypto': require('node:crypto'), zod: require('zod'),
    '@/lib/product-availability': availability, '@/lib/supabase/admin': { createAdminClient: () => client },
    '@/lib/checkout/validate': { checkoutCreateSchema }, '@/lib/checkout/cart-hash': { cartHash },
    '@/lib/checkout/pricing': { computeShipping: () => 0, loadShippingSettings: async () => ({}), round2: (value: number) => Math.round(value * 100) / 100, centsEqual: (a: number, b: number) => Math.round(a * 100) === Math.round(b * 100) },
    '@/lib/authnet/hosted': { getHostedPaymentToken: async ({ amount }: { amount: number }) => {
      state.providerAmount = amount;
      return { ok: true, formToken: 'fixture', hostedUrl: origin };
    } },
    './config': { walletConfig: () => ({ paypal: true, apple_pay: true, amazon_pay: true, environment: 'sandbox' }) },
  };
  const card = evaluate('../src/app/api/checkout/create/route.ts', modules);
  const wallet = evaluate('../src/lib/wallets/prepare.ts', modules);
  return {
    state, rows,
    card: () => card.POST(new NextRequest(`${origin}/api/checkout/create/`, { method: 'POST', body: JSON.stringify(payload) })),
    wallet: (method = 'paypal') => wallet.prepareWalletAttempt({ ...payload, method, requestId: '55555555-5555-4555-8555-555555555555' }, '127.0.0.1', 'a'.repeat(64)),
  };
}

function assertSelectedPacks(lines: Row[]) {
  assert.equal(lines.length, 2);
  const single = lines.find(line => line.product_id === singleId)!;
  const pack = lines.find(line => line.product_id === caseId)!;
  assert.equal(single.product_sku, 'CHAI-SINGLE');
  assert.equal(single.product_name, 'Chai — 1 bag');
  assert.equal(single.quantity, 2);
  assert.equal(single.unit_price, 51.96);
  assert.equal(single.line_subtotal, 103.92);
  assert.equal(single.assigned_vendor_id, localVendor);
  assert.equal(single.unit_wholesale_cost, null, 'case cost must not leak to singles');
  assert.equal(pack.product_sku, 'CHAI-CASE');
  assert.equal(pack.quantity, 1, 'one case remains one shipping/order line unit');
  assert.equal(pack.unit_price, 188.95);
  assert.equal(pack.line_subtotal, 188.95);
  assert.equal(pack.assigned_vendor_id, supplierVendor);
}

test('card checkout snapshots each selected SKU, own pack price and fulfillment vendor', async () => {
  const h = harness();
  assert.equal((await h.card()).status, 200);
  assertSelectedPacks(h.state.writes.find(write => write.table === 'order_items')!.values as Row[]);
  assert.equal((h.state.writes.find(write => write.table === 'orders')!.values as Row).subtotal, 292.87);
  assert.equal(h.state.providerAmount, 292.87, 'browser unit prices/count claims must not affect charged totals');
});

for (const method of ['paypal', 'apple_pay', 'amazon_pay']) {
  test(`${method} checkout preserves pack quantities, prices and local/supplier routing`, async () => {
    const h = harness();
    await h.wallet(method);
    assert.equal(h.state.rpc?.name, 'prepare_wallet_checkout');
    assertSelectedPacks(h.state.rpc!.args.p_items as Row[]);
    assert.equal((h.state.rpc!.args.p_order as Row).subtotal, 292.87);
    assert.equal((h.state.rpc!.args.p_order as Row).total, 292.87);
  });
}

test('an unavailable single blocks a mixed cart without purchasing its available case instead', async () => {
  const h = harness();
  h.rows[1].stock_status = 'out_of_stock';
  assert.equal((await h.card()).status, 400);
  await assert.rejects(h.wallet(), /no longer available/);
  assert.equal(h.state.writes.length, 0);
  assert.equal(h.state.providerAmount, null);
  assert.equal(h.state.rpc, null);
});
