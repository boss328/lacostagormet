import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { NextRequest } from 'next/server';

const require = createRequire(import.meta.url);
const productId = '11111111-1111-4111-8111-111111111111';

function harness() {
  const state = {
    calls: 0, packCount: 0, orderCount: 0, deleted: false, active: true,
    countError: false, deleteError: null as null | { code: string; message: string },
  };
  const modules: Record<string, unknown> = {
    'server-only': {}, 'next/server': require('next/server'),
    '@/lib/admin/session': { ADMIN_COOKIE: 'admin', expectedSessionToken: async () => 'fixture-token' },
    '@/lib/supabase/admin': {
      createAdminClient() {
        state.calls++;
        return { from(table: string) {
          let count = false;
          let operation = 'select';
          let column = '';
          const builder = {
            select(_columns: string, options?: { head: boolean }) { count = options?.head ?? false; return builder; },
            eq(key: string, id: string) { column = key; assert.equal(id, productId); return builder; },
            maybeSingle() { return builder; },
            delete() { operation = 'delete'; return builder; },
            update(values: { is_active: boolean }) { assert.equal(values.is_active, false); operation = 'update'; return builder; },
            then(resolve: (value: unknown) => void) {
              if (table === 'order_items') return resolve({ count: state.orderCount, error: null });
              assert.equal(table, 'products');
              if (count) {
                assert.equal(column, 'pack_parent_id');
                return resolve({ count: state.packCount, error: state.countError ? { code: 'XX000' } : null });
              }
              if (operation === 'delete') {
                if (!state.deleteError) state.deleted = true;
                return resolve({ error: state.deleteError });
              }
              if (operation === 'update') { state.active = false; return resolve({ error: null }); }
              return resolve({ data: { id: productId, name: 'Chai four pack' }, error: null });
            },
          };
          return builder;
        } };
      },
    },
  };
  const compiled = ts.transpileModule(readFileSync(new URL('../src/app/api/admin/products/[id]/delete/route.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as { POST: (req: NextRequest, ctx: { params: { id: string } }) => Promise<Response> } };
  new Function('require', 'module', 'exports', compiled)((name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected boundary: ${name}`);
    return modules[name];
  }, module, module.exports);
  return { state, request: (authenticated = true) => module.exports.POST(new NextRequest(`https://packs.test/api/admin/products/${productId}/delete/`, {
    method: 'POST', headers: authenticated ? { cookie: 'admin=fixture-token' } : {},
  }), { params: { id: productId } }) };
}

test('deleting requires admin authentication before database access', async () => {
  const h = harness();
  assert.equal((await h.request(false)).status, 401);
  assert.equal(h.state.calls, 0);
});

test('original products with pack options return actionable 409 without deleting or hiding products', async () => {
  const h = harness();
  h.state.packCount = 1;
  const response = await h.request();
  assert.equal(response.status, 409);
  assert.match((await response.json()).errorMessage, /Active setting.*remove its pack options/);
  assert.equal(h.state.deleted, false);
  assert.equal(h.state.active, true);
});

test('ordinary options with order history retain existing soft-deactivation behavior', async () => {
  const h = harness();
  h.state.orderCount = 3;
  const response = await h.request();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).deactivated, true);
  assert.equal(h.state.active, false);
  assert.equal(h.state.deleted, false);
});

test('unreferenced products and options still hard-delete successfully', async () => {
  const h = harness();
  const response = await h.request();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).deleted, true);
  assert.equal(h.state.deleted, true);
});

test('a concurrently added option returns 409 from the FK guard without leaking database details', async () => {
  const h = harness();
  h.state.deleteError = { code: '23503', message: 'private fixture-secret on products_pack_parent_id_fkey' };
  const response = await h.request();
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.match(body.errorMessage, /pack options/);
  assert.equal(JSON.stringify(body).includes('fixture-secret'), false);
  assert.equal(h.state.deleted, false);
});

test('an unavailable pack relationship check fails closed without deleting the product', async () => {
  const h = harness();
  h.state.countError = true;
  assert.equal((await h.request()).status, 500);
  assert.equal(h.state.deleted, false);
});
