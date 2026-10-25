import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import { parseCsv } from '../src/lib/admin/csv';
import { validGtin } from '../src/lib/seo/product-schema';
import * as availability from '../src/lib/product-availability';

const require = createRequire(import.meta.url);
type Row = Record<string, unknown>;

function harness() {
  const rows: Row[] = [
    { id: 'legacy', sku: 'LEGACY', name: 'Legacy item', retail_price: 10, units_per_pack: 5, pack_unit_label: null, pack_parent_id: null },
    { id: 'case', sku: 'CASE', name: 'Four pack', retail_price: 188.95, units_per_pack: 4, pack_unit_label: 'bag', pack_parent_id: null },
    { id: 'single', sku: 'SINGLE', name: 'Single bag', retail_price: 51.96, units_per_pack: 1, pack_unit_label: 'bag', pack_parent_id: 'case' },
  ];
  const writes: Array<{ id: string; values: Row }> = [];
  const modules: Record<string, unknown> = {
    'server-only': {}, 'next/server': require('next/server'), '@/lib/admin/csv': { parseCsv },
    '@/lib/seo/product-schema': { validGtin }, '@/lib/product-availability': availability,
    '@/lib/admin/session': { ADMIN_COOKIE: 'admin', expectedSessionToken: async () => 'fixture-token' },
    '@/lib/supabase/admin': { createAdminClient: () => ({ from(table: string) {
      let selected = '';
      let id = '';
      let values: Row | null = null;
      const query = {
        select(columns: string) { selected = columns; return query; }, limit() { return query; },
        eq(_key: string, value: string) { id = value; return query; },
        update(update: Row) { values = update; return query; }, insert() { return query; },
        then(resolve: (value: unknown) => void) {
          if (table === 'products' && values) {
            writes.push({ id, values });
            Object.assign(rows.find(row => row.id === id)!, values);
            return resolve({ data: null, error: null });
          }
          if (table === 'products') {
            assert.ok(selected.includes('pack_unit_label'));
            assert.ok(selected.includes('pack_parent_id'));
            return resolve({ data: rows, error: null });
          }
          resolve({ data: [], error: null });
        },
      };
      return query;
    } }) },
  };
  const compiled = ts.transpileModule(readFileSync(new URL('../src/app/api/admin/products/import/route.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as { POST: (req: NextRequest) => Promise<Response> } };
  new Function('require', 'module', 'exports', compiled)((name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected boundary ${name}`);
    return modules[name];
  }, module, module.exports);
  return { writes, async request(mode: string, csv: string) {
    const form = new FormData();
    form.set('mode', mode);
    form.set('file', new File([csv], 'products.csv', { type: 'text/csv' }));
    const response = await module.exports.POST(new NextRequest('https://packs.test/api/admin/products/import/', {
      method: 'POST', body: form, headers: { cookie: 'admin=fixture-token' },
    }));
    return { status: response.status, body: await response.json() };
  } };
}

for (const sku of ['CASE', 'SINGLE']) {
  test(`CSV rejects changed, cleared or invalid ${sku} counts before any earlier valid row can be written`, async () => {
    for (const value of ['CLEAR', '0', '6', '1.5']) {
      const h = harness();
      const csv = `sku,retail_price,units_per_pack\nLEGACY,20.01,\n${sku},,${value}`;
      const preview = await h.request('preview', csv);
      assert.equal(preview.status, 200);
      assert.equal(preview.body.ok, false);
      assert.equal(preview.body.rows_with_changes, 1);
      assert.equal(preview.body.errors[0].line, 3);
      assert.match(preview.body.errors[0].message, /Pack counts/);
      const applied = await h.request('apply', csv);
      assert.equal(applied.status, 400);
      assert.match(applied.body.error, /nothing was written/);
      assert.equal(h.writes.length, 0);
    }
  });
}

test('unchanged configured counts round-trip while valid cent prices update', async () => {
  const h = harness();
  const result = await h.request('apply', 'sku,retail_price,units_per_pack\nCASE,32.05,4\nSINGLE,20.01,1\nLEGACY,32.20,5');
  assert.equal(result.status, 200);
  assert.equal(result.body.applied, 3);
  assert.deepEqual(h.writes, [
    { id: 'case', values: { retail_price: 32.05 } },
    { id: 'single', values: { retail_price: 20.01 } },
    { id: 'legacy', values: { retail_price: 32.2 } },
  ]);
});

test('legacy unconfigured pack counts keep existing import behavior', async () => {
  for (const [value, expected] of [['CLEAR', null], ['0', 0], ['6', 6]] as const) {
    const h = harness();
    const result = await h.request('apply', `sku,units_per_pack\nLEGACY,${value}`);
    assert.equal(result.status, 200);
    assert.deepEqual(h.writes, [{ id: 'legacy', values: { units_per_pack: expected } }]);
  }
});

test('fractional-cent CSV prices fail validation without applying earlier rows', async () => {
  const h = harness();
  const result = await h.request('apply', 'sku,retail_price\nLEGACY,20.01\nSINGLE,32.051');
  assert.equal(result.status, 400);
  assert.equal(h.writes.length, 0);
});
