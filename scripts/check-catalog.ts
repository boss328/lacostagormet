import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import {
  filterCatalog,
  type CatalogData,
  type CatalogProduct,
} from '../src/lib/catalog-filter';
import { COLLECTIONS } from '../src/lib/collections';
import { SORT_OPTIONS } from '../src/lib/catalog-state';
import { searchFilter } from '../src/lib/admin/search-filter';
import { writeFileSync } from 'node:fs';

async function main() {
  process.loadEnvFile('.env.local');
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const [c, b] = await Promise.all([
    db
      .from('categories')
      .select('id,name,slug,parent_id')
      .eq('is_active', true),
    db.from('brands').select('id,name,slug').eq('is_active', true),
  ]);
  assert.equal(c.error, null);
  assert.equal(b.error, null);
  const products: CatalogProduct[] = [];
  for (let offset = 0; ; offset += 500) {
    const p = await db
      .from('products')
      .select(
        'id,slug,name,sku,description,pack_size,retail_price,stock_status,brand_id,primary_category_id,created_at,is_featured,brands(name,slug),product_categories(category_id),product_images(url,alt_text,is_primary,display_order)',
      )
      .eq('is_active', true)
      .order('id')
      .range(offset, offset + 499);
    assert.equal(p.error, null);
    products.push(...(p.data as unknown as CatalogProduct[]));
    if (p.data!.length < 500) break;
  }
  const data: CatalogData = { products, categories: c.data!, brands: b.data! };
  // The home-page alias must show the products assigned in admin, including
  // freshly moved coffee products that the old merchandising file omitted.
  const coffeeCategory = data.categories.find((c) => c.slug === 'coffee-tea');
  assert.ok(coffeeCategory, 'Coffee & Tea category must exist in the catalog');
  const coffeeIds = new Set([coffeeCategory.id]);
  for (let size = 0; size !== coffeeIds.size; ) {
    size = coffeeIds.size;
    for (const category of data.categories)
      if (category.parent_id && coffeeIds.has(category.parent_id))
        coffeeIds.add(category.id);
  }
  const expectedCoffee = products.filter(
    (p) =>
      coffeeIds.has(p.primary_category_id ?? '') ||
      p.product_categories.some((c) => coffeeIds.has(c.category_id)),
  );
  const coffeeFirst = filterCatalog(data, { category: 'coffee' });
  const actualCoffee = Array.from(
    { length: coffeeFirst.pageCount },
    (_, i) => filterCatalog(data, { category: 'coffee', page: i + 1 }).products,
  ).flat();
  assert.deepEqual(
    actualCoffee.map((p) => p.id).sort(),
    expectedCoffee.map((p) => p.id).sort(),
    'Homepage Coffee & Tea must match admin category assignments',
  );
  const categories = [
    ...new Set([
      ...COLLECTIONS.map((c) => c.slug),
      ...data.categories.map((c) => c.slug),
    ]),
  ];
  let combinations = 0;
  for (const category of [undefined, ...categories])
    for (const brand of [undefined, ...data.brands.map((b) => b.slug)])
      for (const { value: sort } of SORT_OPTIONS) {
        const first = filterCatalog(data, { category, brand, sort });
        const all = Array.from(
          { length: first.pageCount },
          (_, i) =>
            filterCatalog(data, { category, brand, sort, page: i + 1 })
              .products,
        ).flat();
        assert.equal(all.length, first.total);
        assert.equal(new Set(all.map((p) => p.id)).size, all.length);
        if (brand) assert.ok(all.every((p) => p.brands?.slug === brand));
        if (sort.startsWith('price'))
          for (let i = 1; i < all.length; i++)
            assert.ok(
              sort === 'price-asc'
                ? Number(all[i].retail_price) >= Number(all[i - 1].retail_price)
                : Number(all[i].retail_price) <=
                    Number(all[i - 1].retail_price),
            );
        combinations++;
      }
  for (const q of [
    'Big Train',
    'Chai',
    '100%',
    '(Case of 6)',
    '"),is_active.eq.false',
    'a,b',
    'C:\\test',
    '_',
    '*',
    '[Chai]',
    'a.b',
  ]) {
    const actual = filterCatalog(data, { q }).total;
    const expected = products.filter((p) =>
      [
        p.name,
        p.sku,
        p.brands?.name,
        p.description?.replace(/<[^>]*>/g, ' '),
      ].some((s) => s?.toLowerCase().includes(q.toLowerCase())),
    ).length;
    assert.equal(actual, expected);
    const response = await db
      .from('products')
      .select('id')
      .eq('is_active', true)
      .or(searchFilter(['name', 'sku'], q));
    assert.equal(response.error, null, `PostgREST rejected literal ${q}`);
    const expectedIds = products
      .filter((p) =>
        [p.name, p.sku].some((s) => s.toLowerCase().includes(q.toLowerCase())),
      )
      .map((p) => p.id)
      .sort();
    assert.deepEqual(response.data!.map((p) => p.id).sort(), expectedIds);
  }
  assert.equal(
    filterCatalog(data, { category: 'not-a-real-category' }).total,
    0,
  );
  const report = {
    products: products.length,
    brands: data.brands.length,
    combinations,
    categories: COLLECTIONS.map((c) => ({
      name: c.name,
      count: filterCatalog(data, { category: c.slug }).total,
    })),
    checkedAt: new Date().toISOString(),
  };
  writeFileSync('/tmp/lcg-public-catalog.json', JSON.stringify(data));
  console.log(JSON.stringify(report, null, 2));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
