import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import * as availability from '../src/lib/product-availability';
import * as productSchema from '../src/lib/seo/product-schema';
import * as productPackOptions from '../src/lib/product-pack-options';
import { checkoutCreateSchema } from '../src/lib/checkout/validate';
import { productCategoryIds } from '../src/lib/admin/product-categories';

const require = createRequire(import.meta.url);
const productId = '11111111-1111-4111-8111-111111111111';
const origin = 'https://availability.test';
const payload = {
  email: 'test@example.test', clientSubtotal: 20,
  shippingAddress: { firstName: 'Test', lastName: 'Customer', address1: '123 Test St', city: 'Carlsbad', state: 'CA', zip: '92008', phone: '5555555555' },
  items: [{ product_id: productId, quantity: 1 }],
};
type Row = Record<string, unknown>;

function evaluate(file: string, modules: Record<string, unknown>) {
  const compiled = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const target = { exports: {} as Record<string, any> };
  new Function('require', 'module', 'exports', compiled)((name: string) => {
    if (!(name in modules)) throw new Error(`Unmocked availability boundary: ${name}`);
    return modules[name];
  }, target, target.exports);
  return target.exports;
}

function product(stock_status: unknown, overrides: Row = {}): Row {
  return { id: productId, sku: 'TEST-COFFEE', name: 'Test coffee', slug: 'test-coffee', retail_price: 20,
    wholesale_cost: 10, preferred_vendor_id: null, is_active: true, deleted_at: null,
    primary_category_id: 'category', product_categories: [{ category_id: 'category' }], stock_status, ...overrides };
}

function database(row: Row) {
  const state = { writes: [] as Array<{ table: string; values: unknown }>, calls: 0, providerCalls: 0, rpcCalls: 0 };
  const client = {
    from(table: string) {
      state.calls++;
      let write = false;
      let columns = '';
      let single = false;
      const builder: any = {
        select(value = '') { columns = value; return builder; },
        in() { return builder; }, eq() { return builder; }, neq() { return builder; },
        gte() { return builder; }, order() { return builder; }, limit() { return builder; },
        single() { single = true; return builder; }, maybeSingle() { single = true; return builder; },
        insert(values: unknown) { write = true; state.writes.push({ table, values }); return builder; },
        update(values: Row) { write = true; state.writes.push({ table, values }); Object.assign(row, values); return builder; },
        upsert(values: unknown) { write = true; state.writes.push({ table, values }); return builder; },
        then(resolve: (value: { data: unknown; error: null }) => void) {
          let rows: Row[] = [];
          if (table === 'products') {
            // Project checkout reads to catch accidentally omitting availability fields.
            rows = [columns.includes('preferred_vendor_id') && !write
              ? Object.fromEntries(columns.split(',').map(key => [key.trim(), row[key.trim()]]))
              : row];
          } else if (table === 'orders' && write) {
            rows = [{ id: 'order', order_number: 'LCG-TEST', status: 'pending', total: 20 }];
          } else if (table === 'brands' || table === 'categories') {
            rows = [{ id: table === 'brands' ? 'brand' : 'category' }];
          }
          resolve({ data: single ? rows[0] ?? null : rows, error: null });
        },
      };
      return builder;
    },
    async rpc() { state.rpcCalls++; return { data: { id: 'attempt', status: 'prepared' }, error: null }; },
  };
  return { state, client };
}

const pricing = { computeShipping: () => 0, loadShippingSettings: async () => ({}),
  round2: (n: number) => Math.round(n * 100) / 100, centsEqual: (a: number, b: number) => a === b };

function checkoutHarness(row: Row) {
  const db = database(row);
  const modules = {
    'server-only': {}, 'next/server': require('next/server'), 'node:crypto': require('node:crypto'), zod: require('zod'),
    '@/lib/product-availability': availability, '@/lib/supabase/admin': { createAdminClient: () => db.client },
    '@/lib/checkout/validate': { checkoutCreateSchema }, '@/lib/checkout/pricing': pricing,
    '@/lib/checkout/cart-hash': { cartHash: () => 'fixture-hash' },
    '@/lib/authnet/hosted': { getHostedPaymentToken: async () => { db.state.providerCalls++; return { ok: true, formToken: 'fixture', hostedUrl: origin }; } },
    './config': { walletConfig: () => ({ paypal: true, apple_pay: true, amazon_pay: true, environment: 'sandbox' }) },
  };
  const card = evaluate('../src/app/api/checkout/create/route.ts', modules);
  const wallet = evaluate('../src/lib/wallets/prepare.ts', modules);
  return { ...db,
    card: () => card.POST(new NextRequest(`${origin}/api/checkout/create/`, { method: 'POST', body: JSON.stringify(payload) })),
    wallet: () => wallet.prepareWalletAttempt({ ...payload, requestId: '22222222-2222-4222-8222-222222222222', method: 'paypal' }, '127.0.0.1', 'a'.repeat(64)),
  };
}

test('only explicit available states are offered for purchase and advertised to Google', () => {
  for (const status of ['in_stock', 'low_stock', 'out_of_stock', 'discontinued', '', 'unknown', null, undefined]) {
    const expected = status === 'in_stock' || status === 'low_stock';
    assert.equal(availability.isAvailableForPurchase(status), expected);
    assert.equal(productSchema.googleAvailability(status), expected ? 'in_stock' : 'out_of_stock');
  }
});

for (const [name, row] of [
  ['out of stock', product('out_of_stock')], ['discontinued', product('discontinued')],
  ['unknown status', product('unknown')], ['missing status', product(null)],
  ['inactive', product('in_stock', { is_active: false })],
  ['soft-deleted', product('in_stock', { deleted_at: '2026-10-24T00:00:00Z' })],
] as const) {
  test(`card checkout blocks ${name} before writing an order or contacting the payment provider`, async () => {
    const h = checkoutHarness(row);
    const response = await h.card();
    assert.equal(response.status, 400);
    assert.match((await response.json()).errorMessage, /no longer available/);
    assert.equal(h.state.writes.length, 0);
    assert.equal(h.state.providerCalls, 0);
  });
  test(`wallet checkout blocks ${name} before creating a payment attempt`, async () => {
    const h = checkoutHarness(row);
    await assert.rejects(h.wallet(), /no longer available/);
    assert.equal(h.state.writes.length, 0);
    assert.equal(h.state.rpcCalls, 0);
  });
}

for (const status of ['in_stock', 'low_stock']) {
  test(`${status} remains purchasable through card and wallet checkout`, async () => {
    const card = checkoutHarness(product(status));
    assert.equal((await card.card()).status, 200);
    assert.equal(card.state.providerCalls, 1);
    assert.ok(card.state.writes.some(write => write.table === 'orders'));
    const wallet = checkoutHarness(product(status));
    await wallet.wallet();
    assert.equal(wallet.state.rpcCalls, 1);
  });
}

function adminHarness() {
  const db = database(product('out_of_stock'));
  const modules = { 'server-only': {}, 'next/server': require('next/server'),
    '@/lib/supabase/admin': { createAdminClient: () => db.client },
    '@/lib/admin/session': { ADMIN_COOKIE: 'admin', expectedSessionToken: async () => 'fixture-token' },
    '@/lib/admin/slug': { slugify: () => 'test-coffee' }, '@/lib/admin/product-categories': { productCategoryIds },
    '@/lib/product-availability': availability,
  };
  const create = evaluate('../src/app/api/admin/products/create/route.ts', modules);
  const update = evaluate('../src/app/api/admin/products/[id]/update/route.ts', modules);
  return { ...db, async request(kind: 'create' | 'update', status?: string, authenticated = true) {
    const form = new FormData();
    for (const [key, value] of Object.entries({ name: 'Test coffee', sku: 'TEST-COFFEE', slug: 'test-coffee', retail_price: '20',
      category_slug: 'coffee', brand_slug: 'brand', description: 'A test coffee product.', existingManifest: '[]', newImagesMeta: '[]' })) form.set(key, value);
    if (status !== undefined) form.set('stock_status', status);
    const req = new NextRequest(`${origin}/api/admin/products/`, { method: 'POST', body: form,
      headers: authenticated ? { cookie: 'admin=fixture-token' } : {} });
    return kind === 'create' ? create.POST(req) : update.POST(req, { params: { id: productId } });
  } };
}

for (const kind of ['create', 'update'] as const) {
  test(`admin product ${kind} requires authentication before saving a stock status`, async () => {
    const h = adminHarness();
    assert.equal((await h.request(kind, 'in_stock', false)).status, 401);
    assert.equal(h.state.calls, 0);
  });
  test(`admin product ${kind} rejects unrecognized and blank stock states without writes`, async () => {
    for (const status of ['available', '']) {
      const h = adminHarness();
      assert.equal((await h.request(kind, status)).status, 400);
      assert.equal(h.state.writes.length, 0);
    }
  });
  test(`admin product ${kind} persists all supported stock statuses`, async () => {
    for (const status of availability.STOCK_STATUSES) {
      const h = adminHarness();
      assert.equal((await h.request(kind, status)).status, 200);
      const write = h.state.writes.find(write => write.table === 'products');
      assert.equal((write?.values as Row)?.stock_status, status);
    }
  });
}

test('older edit forms preserve availability; older create forms retain their in-stock default', async () => {
  const edit = adminHarness();
  assert.equal((await edit.request('update')).status, 200);
  assert.equal('stock_status' in (edit.state.writes.find(write => write.table === 'products')!.values as Row), false);
  const create = adminHarness();
  assert.equal((await create.request('create')).status, 200);
  assert.equal((create.state.writes.find(write => write.table === 'products')!.values as Row).stock_status, 'in_stock');
});

test('product cards and JSON-LD agree for all availability states', () => {
  const react = require('react');
  const card = evaluate('../src/components/shop/ProductCard.tsx', {
    'react/jsx-runtime': require('react/jsx-runtime'), 'next/link': { default: (props: any) => react.createElement('a', props) },
    './ProductImage': { ProductImage: () => null }, './ProductCardAdd': { ProductCardAdd: () => react.createElement('button', {}, 'Add to cart') },
    '@/lib/bcImage': { bcImage: (value: string) => value }, '@/lib/pack-size': { formatPackSize: () => 'Case' },
    '@/lib/product-availability': availability,
    '@/lib/product-pack-options': productPackOptions,
  });
  const schema = evaluate('../src/components/shop/ProductJsonLd.tsx', {
    'react/jsx-runtime': require('react/jsx-runtime'), '@/lib/seo/product-schema': productSchema,
    '@/lib/checkout/shipping': { calculateShipping: () => 0 },
  });
  for (const status of [...availability.STOCK_STATUSES, 'unknown', null]) {
    const row = product(status);
    const html = require('react-dom/server').renderToStaticMarkup(card.ProductCard({ product: row }));
    const data = JSON.parse(schema.ProductJsonLd({ product: row }).props.dangerouslySetInnerHTML.__html);
    const available = availability.isAvailableForPurchase(status);
    assert.equal(html.includes('Add to cart'), available);
    assert.equal(html.includes('Out of stock'), !available);
    assert.equal(data.offers.availability, `https://schema.org/${available ? 'InStock' : 'OutOfStock'}`);
  }
});

test('Google feed emits saved availability and does not retain stale stock for a day', async () => {
  const rows = availability.STOCK_STATUSES.map(status => ({ ...product(status), sku: status, stock_status: status,
    product_images: [{ url: `${origin}/coffee.jpg`, is_primary: true, display_order: 0 }] }));
  const feed = evaluate('../src/app/api/google-feed.xml/route.ts', {
    '@/lib/seo/product-schema': productSchema,
    '@/lib/supabase/static': { createStaticClient: () => {
      const query: any = { select: () => query, eq: () => query, is: () => query, range: async () => ({ data: rows, error: null }) };
      return { from: () => query };
    } },
  });
  const response = await feed.GET();
  const xml = await response.text();
  for (const status of availability.STOCK_STATUSES) {
    const item = xml.split('<item>').find((item: string) => item.includes(`<g:id>${status}</g:id>`));
    assert.ok(item);
    assert.ok(item.includes(`<g:availability>${productSchema.googleAvailability(status)}</g:availability>`));
  }
  const cache = response.headers.get('Cache-Control');
  assert.match(cache, /s-maxage=300/);
  assert.doesNotMatch(cache, /stale-while-revalidate/);
});

test('product forms show stock options and preserve the saved edit status', () => {
  const react = require('react');
  const modules = {
    react, 'react/jsx-runtime': require('react/jsx-runtime'),
    'next/navigation': { useRouter: () => ({}) }, 'next/link': { default: (props: any) => react.createElement('a', props) },
    '@/lib/admin/slug': { slugify: () => 'test-coffee' },
    '@/lib/product-availability': availability,
    '@/components/admin/MultiImageEditor': { MultiImageEditor: () => null },
  };
  const create = evaluate('../src/components/admin/NewProductForm.tsx', modules);
  const edit = evaluate('../src/components/admin/EditProductForm.tsx', modules);
  const editProduct = { id: productId, name: 'Test coffee', sku: 'TEST-COFFEE', retailPrice: 20, categorySlug: 'coffee',
    additionalCategorySlugs: [], brandSlug: 'brand', description: 'A coffee product.', weightLb: null, upc: '', slug: 'test-coffee',
    metaDescription: '', isActive: true, isFeatured: false, existingImages: [], stockStatus: 'discontinued' };
  for (const [component, props, selected] of [
    [create.NewProductForm, { brands: [], categories: [] }, 'in_stock'],
    [edit.EditProductForm, { brands: [], categories: [], product: editProduct }, 'discontinued'],
  ] as const) {
    const html = require('react-dom/server').renderToStaticMarkup(react.createElement(component, props));
    assert.match(html, new RegExp(`<option value="${selected}" selected=""`));
    for (const status of availability.STOCK_STATUSES) assert.ok(html.includes(`value="${status}"`));
    assert.ok(html.includes('Quantities are not synced automatically.'));
  }
});

test('Google feed keeps full pack prices and supplies per-unit measures only for configured packs', async () => {
  const fixtures = [
    { sku: 'CASE-4', retail_price: 40, units_per_pack: 4, pack_unit_label: 'bag' },
    { sku: 'SINGLE-1', retail_price: 11, units_per_pack: 1, pack_unit_label: 'bag' },
    { sku: 'LEGACY', retail_price: 40, units_per_pack: 4, pack_unit_label: null },
    { sku: 'UNSET', retail_price: 20, units_per_pack: null, pack_unit_label: null },
    { sku: 'INVALID', retail_price: 20, units_per_pack: 0, pack_unit_label: 'bag' },
  ];
  const rows = fixtures.map(fixture => ({ ...product('in_stock'), ...fixture,
    product_images: [{ url: `${origin}/coffee.jpg`, is_primary: true, display_order: 0 }] }));
  let selected = '';
  const feed = evaluate('../src/app/api/google-feed.xml/route.ts', {
    '@/lib/seo/product-schema': productSchema,
    '@/lib/supabase/static': { createStaticClient: () => {
      const query: any = { select: (columns: string) => { selected = columns; return query; }, eq: () => query, is: () => query,
        range: async () => ({ data: rows, error: null }) };
      return { from: () => query };
    } },
  });
  const response = await feed.GET();
  assert.equal(response.status, 200);
  const xml = await response.text();
  assert.match(selected, /units_per_pack/);
  assert.match(selected, /pack_unit_label/);
  for (const fixture of fixtures) {
    const item = xml.split('<item>').find((part: string) => part.includes(`<g:id>${fixture.sku}</g:id>`));
    assert.ok(item);
    assert.ok(item.includes(`<g:price>${fixture.retail_price.toFixed(2)} USD</g:price>`));
    if (fixture.sku === 'CASE-4' || fixture.sku === 'SINGLE-1') {
      assert.ok(item.includes(`<g:unit_pricing_measure>${fixture.units_per_pack} ct</g:unit_pricing_measure>`));
      assert.ok(item.includes('<g:unit_pricing_base_measure>1 ct</g:unit_pricing_base_measure>'));
    } else {
      assert.ok(!item.includes('<g:unit_pricing_'));
    }
    assert.ok(!item.includes('<g:multipack>'));
  }
});
