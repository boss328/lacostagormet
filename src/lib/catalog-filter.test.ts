import { isPreviewWrite } from './preview-mode';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  filterCatalog,
  categoryDescendants,
  type CatalogData,
  type CatalogProduct,
} from './catalog-filter';
import {
  catalogHref,
  parsePage,
  parseSort,
  SORT_OPTIONS,
} from './catalog-state';
import { collectionMembership } from './collections';
import { calculateShipping } from './checkout/shipping';
import { searchFilter } from './admin/search-filter';
import { readAllRows } from './admin/read-all-rows';

const products: CatalogProduct[] = Array.from({ length: 60 }, (_, i) => ({
  id: String(i).padStart(3, '0'),
  name:
    i === 0
      ? '100% Chai, (Cream) "special" _mix'
      : `Product ${String(i).padStart(2, '0')}`,
  slug: `fixture-${i}`,
  sku: `SKU-${i}`,
  retail_price: 10 + Math.floor(i / 3),
  pack_size: null,
  brand_id: i % 2 ? 'b2' : 'b1',
  brands: {
    name: i % 2 ? 'Beta Brand' : 'Alpha Brand',
    slug: i % 2 ? 'beta' : 'alpha',
  },
  primary_category_id: 'child',
  product_categories: [{ category_id: 'child' }, { category_id: 'child' }],
  created_at: i % 2 ? '2026-01-02' : '2026-01-01',
  is_featured: false,
}));
const data: CatalogData = {
  products,
  brands: [
    { id: 'b1', name: 'Alpha Brand', slug: 'alpha' },
    { id: 'b2', name: 'Beta Brand', slug: 'beta' },
  ],
  categories: [
    { id: 'parent', name: 'Parent', slug: 'parent', parent_id: null },
    { id: 'child', name: 'Child', slug: 'child', parent_id: 'parent' },
  ],
};

test('invalid filters fail closed; parent includes descendants and duplicate memberships never duplicate products', () => {
  assert.equal(filterCatalog(data, { brand: 'missing' }).total, 0);
  assert.equal(filterCatalog(data, { category: 'missing' }).total, 0);
  assert.equal(filterCatalog(data, { category: 'parent' }).total, 60);
  assert.equal(
    filterCatalog(data, { category: 'child', brand: 'alpha' }).total,
    30,
  );
});
test('search matches literal punctuation, brand and SKU and intersects filters', () => {
  for (const q of ['100%', '(Cream)', '"special"', '_mix', 'SKU-0'])
    assert.deepEqual(
      filterCatalog(data, { q }).products.map((p) => p.id),
      ['000'],
    );
  assert.equal(
    filterCatalog(data, { q: 'ALPHA BRAND', brand: 'beta' }).total,
    0,
  );
  assert.equal(filterCatalog(data, { q: 'alpha brand' }).total, 30);
  assert.equal(filterCatalog(data, { q: '*' }).total, 0);
  assert.equal(filterCatalog(data, { q: '   ' }).total, 60);
});
test('all sorts have stable, exhaustive pages without duplicates or lost equal-price records', () => {
  for (const { value: sort } of SORT_OPTIONS) {
    const pages = [1, 2, 3].flatMap(
      (page) => filterCatalog(data, { sort, page }).products,
    );
    assert.equal(pages.length, 60);
    assert.equal(new Set(pages.map((p) => p.id)).size, 60);
    assert.deepEqual(
      pages,
      [1, 2, 3].flatMap(
        (page) =>
          filterCatalog(
            { ...data, products: [...products].reverse() },
            { sort, page },
          ).products,
      ),
    );
    if (sort.startsWith('price'))
      for (let i = 1; i < pages.length; i++)
        assert.ok(
          sort === 'price-asc'
            ? Number(pages[i].retail_price) >= Number(pages[i - 1].retail_price)
            : Number(pages[i].retail_price) <=
                Number(pages[i - 1].retail_price),
        );
  }
});
test('bad and out-of-range pages cannot cause unbounded results', () => {
  for (const input of ['1.5', '-2', 'Infinity', '3junk', '0', 'NaN'])
    assert.equal(parsePage(input), 1);
  assert.equal(filterCatalog(data, { page: 9999999 }).page, 3);
  assert.equal(filterCatalog(data, { brand: 'missing', page: 20 }).page, 1);
  assert.equal(parseSort('bogus'), 'newest');
});
test('pagination preserves all filters, changing filters can remove page, URL values are encoded', () => {
  const href = catalogHref(
    '/shop',
    {
      q: 'a&b',
      category: 'chai-matcha',
      brand: 'big-train',
      sort: 'price-desc',
      page: '3',
    },
    { page: undefined },
  );
  const url = new URL(href, 'https://example.test');
  assert.equal(url.searchParams.get('q'), 'a&b');
  assert.equal(url.searchParams.get('brand'), 'big-train');
  assert.equal(url.searchParams.get('category'), 'chai-matcha');
  assert.equal(url.searchParams.get('sort'), 'price-desc');
  assert.equal(url.searchParams.has('page'), false);
});
test('new products inherit categories and special collections; legacy curated assignments remain', () => {
  assert.deepEqual(
    collectionMembership({ slug: 'new-oats', name: 'Fruit oats' }, ['oatmeal']),
    ['oatmeal'],
  );
  assert.ok(
    collectionMembership({ slug: 'new-frappe', name: 'Coffee Frappe' }, [
      'specialty-beverages',
    ]).includes('chai-matcha'),
  );
  assert.ok(
    collectionMembership({ slug: 'new-tea', name: 'Earl Grey Tea' }, [
      'specialty-beverages',
    ]).includes('coffee'),
  );
});
test('category cycles terminate', () => {
  assert.equal(
    categoryDescendants('parent', [
      { id: 'parent', slug: 'p', name: 'P', parent_id: 'child' },
      { id: 'child', slug: 'c', name: 'C', parent_id: 'parent' },
    ]).size,
    2,
  );
});
test('approved shipping boundary is identical for cart and server tier calculation', () => {
  assert.equal(calculateShipping(29.99), 9.95);
  assert.equal(calculateShipping(30), 12.95);
  assert.equal(calculateShipping(70), 12.95);
  assert.equal(calculateShipping(79.99), 12.95);
  assert.equal(calculateShipping(80), 0);
});
test('admin search treats regex, SQL wildcards and query punctuation as literal text', () => {
  for (const query of [
    'a,b)',
    '100%',
    '_',
    '*',
    '[x]',
    'a.b',
    '(hello)',
    'a|b',
  ]) {
    const clause = searchFilter(['name'], query);
    const decoded = JSON.parse(clause.slice('name.imatch.'.length));
    assert.ok(new RegExp(decoded, 'i').test('prefix ' + query + ' suffix'));
    assert.equal(new RegExp(decoded, 'i').test('unrelated product'), false);
  }
  assert.equal(
    searchFilter(['name', 'sku'], 'Chai'),
    'name.imatch."Chai",sku.imatch."Chai"',
  );
});
test('exports read every page and surface errors instead of returning partial CSVs', async () => {
  const rows = Array.from({ length: 1250 }, (_, id) => ({ id }));
  const result = await readAllRows(async (from, to) => ({
    data: rows.slice(from, to + 1),
    error: null,
  }));
  assert.deepEqual(result.data, rows);
  const failed = await readAllRows(async (from) =>
    from
      ? { data: null, error: { message: 'offline' } }
      : { data: rows.slice(0, 500), error: null },
  );
  assert.equal(failed.data, null);
  assert.equal(failed.error?.message, 'offline');
});

test('existing products moved to another category follow the administrator assignment', () => {
  const product = {
    slug: 'two-leaves-and-a-bud-nice-matcha-green-tea-one-1-2-lb-pouch',
    name: 'Nice Matcha',
  };
  assert.deepEqual(collectionMembership(product, ['oatmeal']), ['oatmeal']);
});

test('review mode blocks write paths, cron, payment returns and email callbacks', () => {
  for (const path of [
    '/api/inquiries/submit/',
    '/api/cart/save/',
    '/api/admin/products/',
    '/api/checkout/create/',
  ])
    assert.ok(isPreviewWrite('POST', path));
  for (const path of [
    '/api/cron/send-abandoned-cart-emails/',
    '/api/checkout/wallet/amazon/return/',
    '/auth/callback/',
    '/unsubscribe/',
  ])
    assert.ok(isPreviewWrite('GET', path));
  for (const path of [
    '/shop/',
    '/admin/products/',
    '/api/admin/search/',
    '/api/checkout/wallet/config/',
  ])
    assert.equal(isPreviewWrite('GET', path), false);
  assert.equal(isPreviewWrite('POST', '/api/admin/login/'), false);
});
