import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogPackKey, featuredCatalogProducts, groupCatalogPacks } from './catalog-pack-groups';
import { filterCatalog, type CatalogData, type CatalogProduct } from './catalog-filter';
import { PAGE_SIZE, SORT_OPTIONS } from './catalog-state';

function product(id: string, overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id, sku: id.toUpperCase(), name: `Vanilla ${id}`, slug: id, pack_size: null,
    retail_price: 40, stock_status: 'in_stock', brand_id: 'b1', primary_category_id: 'c1',
    product_categories: [], created_at: '2026-10-01', is_featured: false,
    units_per_pack: 4, pack_unit_label: 'bag', pack_parent_id: null,
    brands: { name: 'First Brand', slug: 'first-brand' }, ...overrides,
  };
}
function catalog(products: CatalogProduct[]): CatalogData {
  return {
    products,
    brands: [{ id: 'b1', name: 'First Brand', slug: 'first-brand' }, { id: 'b2', name: 'Other Brand', slug: 'other-brand' }],
    categories: [{ id: 'c1', name: 'Chai', slug: 'chai', parent_id: null }, { id: 'c2', name: 'Other', slug: 'other', parent_id: null }],
  };
}
const casePack = product('vanilla');
const single = product('vanilla-1', { pack_parent_id: casePack.id, units_per_pack: 1, retail_price: 11 });
const bagWithPhoto = { ...single, product_images: [{ url: '/vanilla-bag-front.jpg', alt_text: 'Single bag front', is_primary: true, display_order: 0 }] };
const canWithPhoto = product('vanilla-can', {
  pack_parent_id: casePack.id, units_per_pack: 1, pack_unit_label: 'canister', retail_price: 5,
  product_images: [{ url: '/vanilla-canister.jpg', alt_text: 'Single canister', is_primary: true, display_order: 0 }],
});

test('one configured family becomes one card with the available smallest SKU and unchanged price', () => {
  const result = groupCatalogPacks([casePack, single]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, single.id);
  assert.equal(result[0].sku, single.sku);
  assert.equal(result[0].retail_price, 11);
  assert.deepEqual(result[0].pack_options?.map(option => [option.id, option.retail_price]), [[single.id, 11], [casePack.id, 40]]);
  assert.equal(single.pack_options, undefined, 'source SKU objects stay untouched');
  assert.deepEqual(groupCatalogPacks([single, casePack]), result);
});

test('without photos, unavailable singles do not replace available cases; exact SKU search keeps the requested case', () => {
  const out = { ...single, stock_status: 'out_of_stock' };
  assert.equal(groupCatalogPacks([out, casePack])[0].id, casePack.id);
  assert.equal(groupCatalogPacks([single, { ...casePack, stock_status: 'out_of_stock' }], { search: ' vanilla ' })[0].id, casePack.id);
  assert.equal(groupCatalogPacks([{ ...casePack, stock_status: 'out_of_stock' }, out])[0].id, single.id);
});

test('a photographed single bag leads a family ahead of a cheaper canister without mixing SKU, price or image', () => {
  const rows = [casePack, canWithPhoto, bagWithPhoto];
  const [result] = groupCatalogPacks(rows);
  assert.equal(result.id, bagWithPhoto.id);
  assert.equal(result.sku, bagWithPhoto.sku);
  assert.equal(result.retail_price, bagWithPhoto.retail_price);
  assert.equal(result.product_images?.[0].url, '/vanilla-bag-front.jpg');
  assert.deepEqual(result.pack_options?.map(option => option.id), [canWithPhoto.id, bagWithPhoto.id, casePack.id]);
  assert.deepEqual(groupCatalogPacks([...rows].reverse()), [result]);
  assert.equal(groupCatalogPacks([{ ...bagWithPhoto, stock_status: 'out_of_stock' }, casePack, canWithPhoto])[0].id, bagWithPhoto.id,
    'stock changes must not silently switch the lead photo to a canister or case');
});

test('exact SKU searches override the photographed single preference, including case and canister searches', () => {
  const rows = [casePack, canWithPhoto, bagWithPhoto];
  for (const requested of rows) {
    const [result] = groupCatalogPacks(rows, { search: ` ${requested.sku.toLowerCase()} ` });
    assert.equal(result.id, requested.id);
    assert.equal(result.retail_price, requested.retail_price);
    assert.deepEqual(result.product_images, requested.product_images);
  }
});

test('a pictured canister is the fallback for absent, hidden, deleted or unpictured single bags', () => {
  for (const bag of [
    null,
    { ...bagWithPhoto, is_active: false },
    { ...bagWithPhoto, deleted_at: '2026-10-28' },
    { ...bagWithPhoto, product_images: [] },
    { ...bagWithPhoto, product_images: [{ ...bagWithPhoto.product_images[0], url: ' ' }] },
  ]) {
    const [result] = groupCatalogPacks([casePack, canWithPhoto, ...(bag ? [bag] : [])]);
    assert.equal(result.id, canWithPhoto.id);
    assert.equal(result.retail_price, canWithPhoto.retail_price);
    assert.equal(result.product_images?.[0].url, '/vanilla-canister.jpg');
  }
  assert.equal(groupCatalogPacks([casePack, { ...canWithPhoto, pack_unit_label: 'can' }])[0].id, canWithPhoto.id);
});

test('without a photographed bag or canister, ordinary availability selection remains unchanged', () => {
  const unavailableBag = { ...bagWithPhoto, stock_status: 'out_of_stock', product_images: [] };
  const unavailableCan = { ...canWithPhoto, stock_status: 'out_of_stock', product_images: [] };
  const photographedBottle = { ...canWithPhoto, pack_unit_label: 'bottle', stock_status: 'out_of_stock' };
  assert.equal(groupCatalogPacks([unavailableBag, unavailableCan, casePack])[0].id, casePack.id);
  assert.equal(groupCatalogPacks([photographedBottle, casePack])[0].id, casePack.id);
  assert.equal(groupCatalogPacks([casePack, { ...bagWithPhoto, is_active: false }, { ...canWithPhoto, deleted_at: '2026-10-28' }])[0].id, casePack.id);
});

test('hidden and deleted sizes never become cards or size choices, including a hidden family parent', () => {
  const result = groupCatalogPacks([
    { ...casePack, is_active: false }, single,
    product('deleted', { pack_parent_id: casePack.id, units_per_pack: 2, deleted_at: '2026-10-20' }),
    product('hidden-unrelated', { is_active: false }),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, single.id);
  assert.equal(result[0].pack_options, undefined);
});

test('shared names, legacy unit counts and invalid configuration never merge unrelated products', () => {
  const legacy = [
    product('legacy-case', { name: 'Same flavor', pack_unit_label: null }),
    product('legacy-single', { name: 'Same flavor', pack_unit_label: null, units_per_pack: 1, pack_parent_id: 'legacy-case' }),
    product('invalid-count', { units_per_pack: 0, pack_parent_id: 'legacy-case' }),
    product('other-flavor'),
  ];
  assert.equal(groupCatalogPacks(legacy).length, 4);
});

test('category, brand and text filters run before grouping and never leak a mismatching sibling', () => {
  const otherSingle = { ...single, primary_category_id: 'c2', brand_id: 'b2', name: 'Individual serving', brands: { name: 'Other Brand', slug: 'other-brand' } };
  const data = catalog([casePack, otherSingle]);
  for (const filters of [{ category: 'chai' }, { brand: 'first-brand' }, { q: 'Vanilla vanilla' }]) {
    const result = filterCatalog(data, filters);
    assert.equal(result.total, 1);
    assert.equal(result.products[0].id, casePack.id);
    assert.equal(result.products[0].pack_options, undefined);
  }
  assert.equal(filterCatalog(data, { category: 'chai', brand: 'other-brand' }).total, 0);
  const skuResult = filterCatalog(catalog([casePack, single]), { q: 'VANILLA' });
  assert.equal(skuResult.total, 1);
  assert.equal(skuResult.products[0].id, casePack.id);
  assert.equal(skuResult.products[0].pack_options?.length, 2);
  assert.equal(filterCatalog(catalog([casePack, single]), { q: 'VANILLA-1' }).products[0].id, single.id);
});

test('grouped totals, all sorts and pages stay stable without splitting or repeating flavors', () => {
  const rows = Array.from({ length: 30 }, (_, index) => {
    const id = `flavor-${String(index).padStart(2, '0')}`;
    return [product(id, { retail_price: 60 + index, created_at: `2026-10-${String(index + 1).padStart(2, '0')}` }),
      product(`${id}-single`, { pack_parent_id: id, units_per_pack: 1, retail_price: 12 + index })];
  }).flat();
  for (const { value: sort } of SORT_OPTIONS) {
    const first = filterCatalog(catalog(rows), { sort });
    const second = filterCatalog(catalog(rows), { sort, page: 2 });
    assert.equal(first.total, 30);
    assert.equal(first.pageCount, 2);
    assert.equal(first.products.length, PAGE_SIZE);
    assert.equal(second.products.length, 6);
    const all = [...first.products, ...second.products];
    assert.equal(new Set(all.map(catalogPackKey)).size, 30);
    assert.ok(all.every(row => row.pack_options?.length === 2));
    assert.deepEqual(first, filterCatalog(catalog([...rows].reverse()), { sort }));
    if (sort.startsWith('price')) for (let index = 1; index < all.length; index++) {
      assert.ok(sort === 'price-asc' ? Number(all[index].retail_price) >= Number(all[index - 1].retail_price)
        : Number(all[index].retail_price) <= Number(all[index - 1].retail_price));
    }
  }
});

test('home keeps the featured family, leads with its photographed bag and fills slots without duplicate flavors', () => {
  const pinned = { ...casePack, is_featured: true };
  const other = product('new-flavor', { created_at: '2026-10-24' });
  const hidden = product('hidden-size', { pack_parent_id: casePack.id, units_per_pack: 2, is_active: false });
  const home = featuredCatalogProducts([bagWithPhoto, canWithPhoto, other, pinned, hidden], 2);
  assert.deepEqual(home.map(row => row.id), [single.id, other.id]);
  assert.deepEqual(home[0].pack_options?.map(row => row.id), [canWithPhoto.id, single.id, casePack.id]);
  assert.equal(home[0].retail_price, single.retail_price);
  assert.equal(home[0].product_images?.[0].url, '/vanilla-bag-front.jpg');
  assert.equal(home[1].pack_options, undefined);
});

test('home preference preserves featured family ranking even when several featured sizes have different dates', () => {
  const pinnedBag = { ...bagWithPhoto, is_featured: true, created_at: '2026-10-29' };
  const pinnedCan = { ...canWithPhoto, is_featured: true, created_at: '2026-10-01' };
  const newerFamily = product('newer-featured', { is_featured: true, created_at: '2026-10-20' });
  const home = featuredCatalogProducts([pinnedBag, casePack, pinnedCan, newerFamily]);
  assert.deepEqual(home.map(row => row.id), [newerFamily.id, pinnedBag.id],
    'the old featured representative was the cheaper canister; changing its photo must not move the family ahead');
  assert.equal(home[1].retail_price, pinnedBag.retail_price);
  assert.equal(new Set(home.map(catalogPackKey)).size, home.length);
  assert.deepEqual(featuredCatalogProducts([newerFamily, pinnedCan, casePack, pinnedBag]), home);
});

test('home falls back to a photographed canister, and leaves a featured case selected when no eligible photo exists', () => {
  const pinned = { ...casePack, is_featured: true };
  assert.equal(featuredCatalogProducts([pinned, single, canWithPhoto])[0].id, canWithPhoto.id);
  const [withoutPhotos] = featuredCatalogProducts([pinned, single]);
  assert.equal(withoutPhotos.id, pinned.id);
  assert.deepEqual(withoutPhotos.pack_options?.map(row => row.id), [single.id, casePack.id]);
});
