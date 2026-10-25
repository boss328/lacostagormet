import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import * as packs from '../src/lib/product-packs';
import * as availability from '../src/lib/product-availability';

const require = createRequire(import.meta.url);
const origin = 'https://packs-fixture.test';
const parentId = '11111111-1111-4111-8111-111111111111';
const childId = '22222222-2222-4222-8222-222222222222';
const vendorId = '33333333-3333-4333-8333-333333333333';
const input = {
  sku: 'CHAI-SINGLE', name: 'Chai single bag', slug: 'chai-single-bag', retail_price: 51.96,
  units_per_pack: 1, parent_units_per_pack: 4, pack_unit_label: 'bag', weight_lb: 3.25,
  vendor_id: vendorId, description: 'One bag of chai mix.',
};

function harness() {
  const state = { preview: false, token: 'admin-token', clients: 0, rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>, error: null as null | { code: string; message: string }, missing: false };
  const image = { id: 'image', product_id: parentId, url: 'https://image.example/chai.jpg', alt_text: 'Chai bag', is_primary: true, display_order: 0 };
  const rows = [
    { id: parentId, ...input, sku: 'CASE', units_per_pack: 4, pack_parent_id: null, preferred_vendor_id: vendorId, product_images: [image], is_active: true, stock_status: 'in_stock' },
    { id: childId, ...input, pack_parent_id: parentId, preferred_vendor_id: vendorId, product_images: [], is_active: false, stock_status: 'out_of_stock' },
  ];
  const modules: Record<string, unknown> = {
    'server-only': {}, 'next/server': require('next/server'),
    '@/lib/admin/session': { ADMIN_COOKIE: 'fixture-admin', expectedSessionToken: async () => state.token },
    '@/lib/preview-mode': { isReadOnlyPreview: () => state.preview },
    '@/lib/product-packs': packs, '@/lib/product-availability': availability,
    '@/lib/supabase/admin': {
      createAdminClient() {
        state.clients++;
        return {
          async rpc(name: string, args: Record<string, unknown>) {
            state.rpcCalls.push({ name, args });
            return { data: state.error ? null : name === 'configure_product_pack' ? parentId : childId, error: state.error };
          },
          from(table: string) {
            let id = '';
            let single = false;
            const builder = {
              select() { return builder; },
              eq(key: string, value: unknown) { if (key === 'id') id = String(value); return builder; },
              is() { return builder; },
              or(filter: string) { assert.equal(filter, `id.eq.${parentId},pack_parent_id.eq.${parentId}`); return builder; },
              order() { return builder; },
              maybeSingle() { single = true; return builder; },
              then(resolve: (value: unknown) => void) {
                assert.ok(table === 'products' || table === 'vendors');
                const data = table === 'vendors'
                  ? [{ id: vendorId, name: 'Local shipping', is_self_fulfilled: true }]
                  : state.missing ? null : single ? rows.find(row => row.id === id) : rows;
                resolve({ data: state.error ? null : data, error: state.error });
              },
            };
            return builder;
          },
        };
      },
    },
  };
  const compiled = ts.transpileModule(readFileSync(new URL('../src/app/api/admin/products/[id]/pack-options/route.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((name: string) => {
    if (!(name in modules)) throw new Error(`Unmocked boundary ${name}`);
    return modules[name];
  }, module, module.exports);
  const route = module.exports as Record<'GET' | 'POST' | 'PATCH', (req: NextRequest, ctx: { params: { id: string } }) => Promise<Response>>;
  async function request(method: 'GET' | 'POST' | 'PATCH', body: unknown = input, opts: { token?: string; origin?: string; id?: string; raw?: string; contentType?: string } = {}) {
    const headers: Record<string, string> = { cookie: `fixture-admin=${opts.token ?? 'admin-token'}`, origin: opts.origin ?? origin };
    if (method !== 'GET') headers['content-type'] = opts.contentType ?? 'application/json';
    const response = await route[method](new NextRequest(`${origin}/api/admin/products/${opts.id ?? parentId}/pack-options/`, {
      method, headers, ...(method === 'GET' ? {} : { body: opts.raw ?? JSON.stringify(body) }),
    }), { params: { id: opts.id ?? parentId } });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return { status: response.status, body: await response.json() };
  }
  return { state, request };
}

test('admin auth, origin and preview guards reject writes before any database use', async () => {
  const h = harness();
  for (const method of ['GET', 'POST', 'PATCH'] as const) assert.equal((await h.request(method, input, { token: 'invalid' })).status, 401);
  assert.equal((await h.request('POST', input, { origin: 'https://external.test' })).status, 403);
  assert.equal((await h.request('PATCH', {}, { origin: '' })).status, 403);
  h.state.preview = true;
  assert.equal((await h.request('POST')).status, 409);
  assert.equal((await h.request('PATCH', { units_per_pack: 4, pack_unit_label: 'bag' })).status, 409);
  h.state.token = '';
  assert.equal((await h.request('GET', {}, { token: '' })).status, 401);
  assert.equal(h.state.clients, 0);
});

test('invalid inputs and oversized JSON never reach the database', async () => {
  const h = harness();
  assert.equal((await h.request('POST', input, { id: 'malformed' })).status, 400);
  assert.equal((await h.request('POST', { ...input, weight_lb: 0 })).status, 400);
  assert.equal((await h.request('POST', input, { raw: '{invalid' })).status, 400);
  assert.equal((await h.request('POST', input, { contentType: 'text/plain' })).status, 400);
  assert.equal((await h.request('POST', input, { raw: ' '.repeat(16385) })).status, 413);
  assert.equal(h.state.clients, 0);
});

test('GET includes draft siblings, resolves the original from a child, and returns explicit fulfillment/image choices', async () => {
  const h = harness();
  const result = await h.request('GET', {}, { id: childId });
  assert.equal(result.status, 200);
  assert.equal(result.body.parentId, parentId);
  assert.equal(result.body.options.length, 2);
  assert.equal(result.body.options.find((row: packs.PackOption) => row.id === childId).is_active, false);
  assert.equal(result.body.options[0].vendor_id, vendorId);
  assert.equal(result.body.options[0].primary_image_url, 'https://image.example/chai.jpg');
  assert.deepEqual(result.body.vendors, [{ id: vendorId, name: 'Local shipping', is_self_fulfilled: true }]);
  assert.equal(result.body.images[0].product_id, parentId);
});

test('POST uses exactly one atomic RPC and defaults to a draft without copying unsafe case fields', async () => {
  const h = harness();
  const result = await h.request('POST', { ...input, upc: 'case-code', wholesale_cost: 99 });
  assert.equal(result.status, 201);
  assert.equal(result.body.product.id, childId);
  assert.equal(h.state.rpcCalls.length, 1);
  assert.equal(h.state.rpcCalls[0].name, 'create_product_pack_option');
  const payload = h.state.rpcCalls[0].args.p_input as Record<string, unknown>;
  assert.equal(payload.is_active, false);
  assert.equal(payload.stock_status, 'out_of_stock');
  assert.equal(payload.primary_image_url, null);
  assert.equal('upc' in payload, false);
  assert.equal('wholesale_cost' in payload, false);
  assert.equal(payload.vendor_id, vendorId);
});

test('PATCH sends original pack configuration through the transactional function', async () => {
  const h = harness();
  const result = await h.request('PATCH', { units_per_pack: 4, pack_unit_label: ' Bag ' });
  assert.equal(result.status, 200);
  assert.deepEqual(h.state.rpcCalls, [{ name: 'configure_product_pack', args: { p_product_id: parentId, p_units: 4, p_label: 'bag' } }]);
});

test('missing products, uniqueness conflicts and backend failures surface safe errors', async () => {
  const h = harness();
  h.state.missing = true;
  assert.equal((await h.request('GET')).status, 404);
  h.state.missing = false;
  for (const [code, status] of [['23505', 409], ['22023', 400], ['P0002', 404], ['PGRST202', 503], ['unexpected', 500]] as const) {
    h.state.error = { code, message: 'private SQL credentials fixture-secret' };
    const result = await h.request('POST');
    assert.equal(result.status, status);
    assert.equal(JSON.stringify(result.body).includes('fixture-secret'), false);
    assert.equal(result.body.ok, false);
  }
});
