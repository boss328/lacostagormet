import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import * as availability from '../src/lib/product-availability';
import { productCategoryIds } from '../src/lib/admin/product-categories';

const require = createRequire(import.meta.url);
const productId = '11111111-1111-4111-8111-111111111111';
type Row = Record<string, unknown>;
function evaluate(file: string, modules: Record<string, unknown>, fetcher?: (url: string, options: { body: FormData }) => Promise<unknown>) {
  const compiled = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} as Record<string, any> };
  new Function('require', 'module', 'exports', 'fetch', 'setTimeout', compiled)((name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected boundary ${name}`);
    return modules[name];
  }, module, module.exports, fetcher, () => 0);
  return module.exports;
}

async function submitForm(kind: 'new' | 'edit', price: string) {
  let hookIndex = 0;
  let submittedPrice: string | null = null;
  const setters: unknown[] = [];
  const values: Record<number, unknown> = kind === 'new'
    ? { 0: 'Single chai bag', 1: 'CHAI-SINGLE', 2: price, 3: 'chai', 4: 'brand', 5: 'One bag of chai mix.' }
    : { 2: price };
  const modules = {
    react: { useState(initial: unknown) {
      const index = hookIndex++;
      const value = index in values ? values[index] : typeof initial === 'function' ? initial() : initial;
      return [value, (next: unknown) => setters.push(next)];
    } },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/navigation': { useRouter: () => ({}) }, 'next/link': { default: () => null },
    '@/lib/admin/slug': { slugify: () => 'single-chai-bag' },
    '@/lib/product-availability': availability,
    '@/components/admin/MultiImageEditor': { MultiImageEditor: () => null },
  };
  const component = evaluate(`../src/components/admin/${kind === 'new' ? 'NewProductForm' : 'EditProductForm'}.tsx`, modules, async (_url, options) => {
    submittedPrice = String(options.body.get('retail_price'));
    return { ok: true, json: async () => ({ ok: true, product: { id: productId, name: 'Single chai bag' } }) };
  });
  const props = {
    brands: [{ id: 'brand', name: 'Brand', slug: 'brand' }], categories: [{ id: 'category', name: 'Chai', slug: 'chai' }],
    product: {
      id: productId, name: 'Single chai bag', sku: 'CHAI-SINGLE', retailPrice: 20.01, categorySlug: 'chai',
      additionalCategorySlugs: [], brandSlug: 'brand', description: 'One bag of chai mix.', weightLb: 3.25,
      upc: '', slug: 'single-chai-bag', metaDescription: '', isActive: false, isFeatured: false,
      stockStatus: 'out_of_stock', existingImages: [],
    },
  };
  const tree = kind === 'new' ? component.NewProductForm(props) : component.EditProductForm(props);
  function findSubmit(node: any): ((event: { preventDefault(): void }) => Promise<void>) | null {
    if (!node || typeof node !== 'object') return null;
    if (typeof node.props?.onSubmit === 'function') return node.props.onSubmit;
    for (const child of [node.props?.children].flat(Infinity)) {
      const submit = findSubmit(child);
      if (submit) return submit;
    }
    return null;
  }
  const onSubmit = findSubmit(tree);
  assert.ok(onSubmit, 'the real product form exposes its submit handler');
  await onSubmit({ preventDefault() {} });
  return { submittedPrice, setters };
}

async function submitApi(kind: 'create' | 'update', price: string) {
  const writes: Array<{ table: string; values: Row }> = [];
  let calls = 0;
  const client = { from(table: string) {
    calls++;
    let single = false;
    const query = {
      select() { return query; }, eq() { return query; }, neq() { return query; }, in() { return query; },
      single() { single = true; return query; }, maybeSingle() { single = true; return query; },
      insert(values: Row) { writes.push({ table, values }); return query; },
      update(values: Row) { writes.push({ table, values }); return query; },
      upsert() { return query; },
      then(resolve: (value: unknown) => void) {
        const row = table === 'products'
          ? { id: productId, sku: 'CHAI-SINGLE', slug: 'single-chai-bag', name: 'Single chai bag', primary_category_id: 'category', product_categories: [] }
          : table === 'brands' || table === 'categories' ? { id: table === 'brands' ? 'brand' : 'category' } : null;
        resolve({ data: single ? row : [], error: null });
      },
    };
    return query;
  } };
  const modules = {
    'server-only': {}, 'next/server': require('next/server'),
    '@/lib/supabase/admin': { createAdminClient: () => client },
    '@/lib/admin/session': { ADMIN_COOKIE: 'admin', expectedSessionToken: async () => 'fixture-token' },
    '@/lib/admin/slug': { slugify: () => 'single-chai-bag' }, '@/lib/admin/product-categories': { productCategoryIds },
    '@/lib/product-availability': availability,
  };
  const route = evaluate(`../src/app/api/admin/products/${kind === 'create' ? 'create' : '[id]/update'}/route.ts`, modules);
  const form = new FormData();
  for (const [key, value] of Object.entries({
    name: 'Single chai bag', sku: 'CHAI-SINGLE', slug: 'single-chai-bag', retail_price: price,
    category_slug: 'chai', brand_slug: 'brand', description: 'One bag of chai mix.', weight_lb: '3.25',
    is_active: 'false', stock_status: 'out_of_stock', existingManifest: '[]', newImagesMeta: '[]',
  })) form.set(key, value);
  const response = await route.POST(new NextRequest('https://price-fixture.test/api/admin/products/', {
    method: 'POST', body: form, headers: { cookie: 'admin=fixture-token' },
  }), { params: { id: productId } });
  return { response, writes, calls };
}

for (const price of ['20.01', '32.05', '32.20', '51.96']) {
  test(`new and edit forms submit ${price} and both APIs preserve its exact cent amount`, async () => {
    for (const kind of ['new', 'edit'] as const) {
      assert.equal((await submitForm(kind, price)).submittedPrice, price);
    }
    for (const kind of ['create', 'update'] as const) {
      const result = await submitApi(kind, price);
      assert.equal(result.response.status, 200);
      assert.equal(result.writes.find(write => write.table === 'products')?.values.retail_price, Number(price));
    }
  });
}

test('forms and APIs still reject fractional cents and nonpositive amounts without writes', async () => {
  for (const price of ['20.011', '32.051', '0', '-20.01', 'not a price']) {
    for (const kind of ['new', 'edit'] as const) {
      const result = await submitForm(kind, price);
      assert.equal(result.submittedPrice, null);
      assert.ok(result.setters.some(value => value && typeof value === 'object' && 'retail_price' in value));
    }
    for (const kind of ['create', 'update'] as const) {
      const result = await submitApi(kind, price);
      assert.equal(result.response.status, 400);
      assert.equal(result.calls, 0);
      assert.equal(result.writes.length, 0);
    }
  }
});
