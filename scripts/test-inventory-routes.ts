import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import * as packs from '../src/lib/product-packs';

const require = createRequire(import.meta.url);
const origin = 'https://inventory-fixture.test';
const productId = '11111111-1111-4111-8111-111111111111';
const siblingId = '22222222-2222-4222-8222-222222222222';
const vendorId = '33333333-3333-4333-8333-333333333333';
const inactiveVendorId = '44444444-4444-4444-8444-444444444444';
const requestId = '55555555-5555-4555-8555-555555555555';
const input = { action: 'add', quantity: 4, reason: 'New stock received', requestId };
type Row = Record<string, unknown>;
type Query = { table: string; columns: string; filters: Array<[string, unknown]>; limit: number | null; values?: Row };

function harness() {
  const state = {
    token: 'admin-token', preview: false, clients: 0,
    queries: [] as Query[], rpcCalls: [] as Array<{ name: string; args: Row }>,
    error: null as null | { code: string; message: string }, missing: false, untracked: false,
  };
  const tables: Record<string, Row[]> = {
    products: [
      { id: productId, sku: 'CAN-1', name: 'Single canister', stock_status: 'in_stock', weight_lb: 1.25, preferred_vendor_id: vendorId, units_per_pack: 1, pack_unit_label: 'canister', pack_size: '14 oz', deleted_at: null },
      { id: siblingId, sku: 'CASE-4', name: 'Four bags', stock_status: 'in_stock', weight_lb: 17, preferred_vendor_id: vendorId, deleted_at: null },
    ],
    product_inventory: [
      { product_id: productId, on_hand: 12, reserved: 2, low_stock_threshold: 5, updated_at: '2026-10-27T12:00:00Z' },
      { product_id: siblingId, on_hand: 7, reserved: 1, low_stock_threshold: 5, updated_at: '2026-10-27T12:00:00Z' },
    ],
    inventory_movements: [
      { id: 'movement-can', product_id: productId, action: 'add', quantity: 4, on_hand_after: 12, reserved_after: 2, reason: 'Received', created_at: '2026-10-27T12:00:00Z', order_id: null },
      { id: 'movement-case', product_id: siblingId, action: 'remove', quantity: 1, on_hand_after: 7, reserved_after: 1, reason: 'Damaged', created_at: '2026-10-27T12:00:00Z', order_id: null },
    ],
    vendors: [
      { id: vendorId, name: 'Local shipping', is_self_fulfilled: true, is_active: true, deleted_at: null },
      { id: inactiveVendorId, name: 'Old supplier', is_self_fulfilled: false, is_active: false, deleted_at: null },
    ],
  };
  const modules: Record<string, unknown> = {
    'server-only': {}, 'next/server': require('next/server'), zod: require('zod'),
    '@/lib/admin/session': { ADMIN_COOKIE: 'fixture-admin', expectedSessionToken: async () => state.token },
    '@/lib/preview-mode': { isReadOnlyPreview: () => state.preview },
    '@/lib/product-packs': packs,
    '@/lib/supabase/admin': { createAdminClient() {
      state.clients++;
      return {
        async rpc(name: string, args: Row) {
          state.rpcCalls.push({ name, args });
          return { data: state.error ? null : { product_id: args.p_product_id, on_hand: 16, reserved: 2, available: 14, stock_status: 'in_stock' }, error: state.error };
        },
        from(table: string) {
          assert.ok(table in tables, `Unexpected table ${table}`);
          const query: Query = { table, columns: '', filters: [], limit: null };
          state.queries.push(query);
          let single = false;
          const builder = {
            select(columns: string) { query.columns = columns; return builder; },
            eq(key: string, value: unknown) { query.filters.push([key, value]); return builder; },
            is(key: string, value: unknown) { query.filters.push([key, value]); return builder; },
            order() { return builder; },
            limit(count: number) { query.limit = count; return builder; },
            maybeSingle() { single = true; return builder; },
            update(values: Row) { query.values = values; return builder; },
            then(resolve: (value: unknown) => void) {
              let rows = tables[table].filter(row => query.filters.every(([key, value]) => row[key] === value));
              if (state.missing && table === 'products') rows = [];
              if (state.untracked && table === 'product_inventory') rows = [];
              if (query.limit !== null) rows = rows.slice(0, query.limit);
              if (query.values && !state.error) for (const row of rows) Object.assign(row, query.values);
              const projected = rows.map(row => Object.fromEntries(query.columns.split(',').map(key => [key, row[key]])));
              resolve({ data: state.error ? null : single ? projected[0] ?? null : projected, error: state.error });
            },
          };
          return builder;
        },
      };
    } },
  };
  const compiled = ts.transpileModule(readFileSync(new URL('../src/app/api/admin/products/[id]/inventory/route.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const target = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((name: string) => {
    if (!(name in modules)) throw new Error(`Unmocked inventory boundary ${name}`);
    return modules[name];
  }, target, target.exports);
  const route = target.exports as Record<'GET' | 'POST' | 'PATCH', (req: NextRequest, ctx: { params: { id: string } }) => Promise<Response>>;
  async function request(method: 'GET' | 'POST' | 'PATCH', body: unknown = input, opts: { token?: string; origin?: string; id?: string; raw?: string; contentType?: string; contentLength?: string } = {}) {
    const headers: Record<string, string> = { cookie: `fixture-admin=${opts.token ?? 'admin-token'}`, origin: opts.origin ?? origin };
    if (method !== 'GET') headers['content-type'] = opts.contentType ?? 'application/json';
    if (opts.contentLength) headers['content-length'] = opts.contentLength;
    const response = await route[method](new NextRequest(`${origin}/api/admin/products/${opts.id ?? productId}/inventory/`, {
      method, headers, ...(method === 'GET' ? {} : { body: opts.raw ?? JSON.stringify(body) }),
    }), { params: { id: opts.id ?? productId } });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return { status: response.status, body: await response.json() };
  }
  return { state, tables, request };
}

test('all inventory methods authenticate and reject malformed IDs before database access', async () => {
  const h = harness();
  for (const method of ['GET', 'POST', 'PATCH'] as const) {
    assert.equal((await h.request(method, input, { token: 'invalid' })).status, 401);
    assert.equal((await h.request(method, input, { id: 'not-a-uuid' })).status, 400);
  }
  h.state.token = '';
  assert.equal((await h.request('GET', {}, { token: '' })).status, 401);
  assert.equal(h.state.clients, 0);
});

test('cross-origin writes, missing origin and read-only previews cannot alter inventory', async () => {
  const h = harness();
  for (const method of ['POST', 'PATCH'] as const) {
    assert.equal((await h.request(method, input, { origin: 'https://external.test' })).status, 403);
    assert.equal((await h.request(method, input, { origin: '' })).status, 403);
  }
  h.state.preview = true;
  assert.equal((await h.request('POST')).status, 409);
  assert.equal((await h.request('PATCH', { vendorId, weightLb: 1.25 })).status, 409);
  assert.equal(h.state.clients, 0);
  assert.equal((await h.request('GET')).status, 200, 'read-only inventory remains inspectable');
});

test('adjustments reject fractional, negative, excessive and coercible quantities without writes', async () => {
  const h = harness();
  for (const quantity of [-1, 1.5, 1000001, '3', null]) {
    for (const action of ['start', 'add', 'remove']) assert.equal((await h.request('POST', { ...input, quantity, action })).status, 400);
  }
  for (const bad of [{ action: 'set' }, { reason: '  ' }, { reason: 'x'.repeat(501) }, { requestId: 'bad' }, { retail_price: 1 }, { quantity: null }]) {
    assert.equal((await h.request('POST', { ...input, ...bad })).status, 400);
  }
  assert.equal(h.state.clients, 0);
});

test('zero units is allowed only as an explicit starting count', async () => {
  const h = harness();
  assert.equal((await h.request('POST', { ...input, action: 'add', quantity: 0 })).status, 400);
  assert.equal((await h.request('POST', { ...input, action: 'remove', quantity: 0 })).status, 400);
  assert.equal(h.state.rpcCalls.length, 0);
  assert.equal((await h.request('POST', { ...input, action: 'start', quantity: 0 })).status, 200);
  assert.equal(h.state.rpcCalls[0].args.p_quantity, 0);
});

test('malformed JSON, wrong content type and oversized streamed bodies never reach storage', async () => {
  const h = harness();
  for (const method of ['POST', 'PATCH'] as const) {
    assert.equal((await h.request(method, input, { raw: '{invalid' })).status, 400);
    assert.equal((await h.request(method, input, { contentType: 'text/plain' })).status, 400);
    assert.equal((await h.request(method, input, { raw: ' '.repeat(4097) })).status, 400);
    assert.equal((await h.request(method, input, { contentLength: '4097' })).status, 400);
  }
  assert.equal(h.state.clients, 0);
});

test('GET returns only the requested SKU counts and history, with active fulfillment choices', async () => {
  const h = harness();
  const result = await h.request('GET');
  assert.equal(result.status, 200);
  assert.equal(result.body.product.sku, 'CAN-1');
  assert.deepEqual(result.body.inventory, { product_id: productId, on_hand: 12, reserved: 2, low_stock_threshold: 5, updated_at: '2026-10-27T12:00:00Z' });
  assert.deepEqual(result.body.movements.map((row: Row) => row.id), ['movement-can']);
  assert.equal(JSON.stringify(result.body).includes(siblingId), false);
  assert.deepEqual(result.body.vendors, [{ id: vendorId, name: 'Local shipping', is_self_fulfilled: true }]);
  const history = h.state.queries.find(query => query.table === 'inventory_movements')!;
  assert.equal(history.limit, 30);
  assert.deepEqual(history.filters, [['product_id', productId]]);
  assert.equal(h.state.rpcCalls.length, 0);
});

test('GET supports products not yet tracking stock and rejects deleted/missing products', async () => {
  const h = harness();
  h.state.untracked = true;
  assert.equal((await h.request('GET')).body.inventory, null);
  h.tables.products[0].deleted_at = '2026-10-27T12:00:00Z';
  assert.equal((await h.request('GET')).status, 404);
  assert.equal((await h.request('GET', {}, { id: requestId })).status, 404);
});

test('POST forwards the idempotency key and one-SKU adjustment to one atomic RPC only', async () => {
  const h = harness();
  const result = await h.request('POST', { ...input, reason: '  New stock received  ' });
  assert.equal(result.status, 200);
  assert.deepEqual(h.state.rpcCalls, [{ name: 'inventory_adjust', args: {
    p_product_id: productId, p_action: 'add', p_quantity: 4, p_reason: 'New stock received', p_request_id: requestId,
  } }]);
  assert.equal(h.state.queries.length, 0, 'adjustment does not write stale product fields directly');
  assert.equal(result.body.inventory.product_id, productId);
  await h.request('POST');
  assert.equal(h.state.rpcCalls[1].args.p_request_id, requestId, 'same retry ID reaches the database deduplication fence');
});

test('PATCH validates the fulfillment vendor and weight without accepting unrelated product fields', async () => {
  const h = harness();
  for (const patch of [
    { vendorId: 'invalid', weightLb: 1 }, { vendorId, weightLb: 0 }, { vendorId, weightLb: -1 },
    { vendorId, weightLb: '1' }, { vendorId, weightLb: 10000 }, { vendorId, weightLb: null },
    { vendorId, weightLb: 1, stock_status: 'in_stock' },
  ]) assert.equal((await h.request('PATCH', patch)).status, 400);
  assert.equal(h.state.clients, 0);
  assert.equal((await h.request('PATCH', { vendorId: inactiveVendorId, weightLb: 1.25 })).status, 400);
  assert.equal(h.state.queries.filter(query => query.values).length, 0);
  assert.equal((await h.request('PATCH', { vendorId: requestId, weightLb: 1.25 })).status, 400);
});

test('PATCH changes only this SKU fulfillment fields and preserves sibling stock and product pricing', async () => {
  const h = harness();
  const siblingBefore = { ...h.tables.products[1] };
  const stockBefore = structuredClone(h.tables.product_inventory);
  const result = await h.request('PATCH', { vendorId, weightLb: 1.75 });
  assert.equal(result.status, 200);
  const write = h.state.queries.find(query => query.values)!;
  assert.equal(write.table, 'products');
  assert.deepEqual(write.values, { preferred_vendor_id: vendorId, weight_lb: 1.75 });
  assert.deepEqual(write.filters, [['id', productId], ['deleted_at', null]]);
  assert.deepEqual(h.tables.products[1], siblingBefore);
  assert.deepEqual(h.tables.product_inventory, stockBefore);
  assert.equal(h.state.rpcCalls.length, 0);
});

test('PATCH reports missing products and storage errors rather than claiming a saved change', async () => {
  const h = harness();
  h.state.missing = true;
  assert.equal((await h.request('PATCH', { vendorId, weightLb: 1.75 })).status, 404);
  h.state.error = { code: 'unexpected', message: 'private database detail' };
  const failed = await h.request('PATCH', { vendorId, weightLb: 1.75 });
  assert.equal(failed.status, 500);
  assert.equal(failed.body.ok, false);
  assert.equal(JSON.stringify(failed.body).includes('private database detail'), false);
});

test('inventory conflicts, missing rows and unavailable schema surface actionable failure statuses', async () => {
  const h = harness();
  for (const [code, status] of [['P0001', 409], ['23505', 409], ['23514', 409], ['22023', 409], ['P0002', 404], ['PGRST202', 503], ['42P01', 503], ['unexpected', 500]] as const) {
    h.state.error = { code, message: 'Inventory: insufficient available units.' };
    const result = await h.request('POST');
    assert.equal(result.status, status, code);
    assert.equal(result.body.ok, false);
  }
});

test('database constraint details are not exposed as inventory messages', async () => {
  const h = harness();
  for (const code of ['P0001', '23505', '23514', '22023', 'unexpected']) {
    h.state.error = { code, message: 'private database constraint and fixture-secret' };
    const result = await h.request('POST');
    assert.equal(result.body.ok, false);
    assert.equal(JSON.stringify(result.body).includes('fixture-secret'), false, code);
  }
  h.state.error = { code: 'P0001', message: 'Inventory: not enough unreserved units.' };
  assert.match((await h.request('POST')).body.errorMessage, /not enough unreserved units/);
});
