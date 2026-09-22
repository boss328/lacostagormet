import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';

// Reviewed plant-milk products; excludes almond oatmeal, milk tea and powders.
const skus = [
  '29252',
  'USMK-01032006',
  '00660',
  '00661',
  'USMK-02032006',
  '04320',
];
async function main() {
  const [env, mode] = process.argv.slice(2);
  assert.ok(env && ['--check', '--apply'].includes(mode));
  process.loadEnvFile(env);
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const products = await db
    .from('products')
    .select('id,sku,name,primary_category_id,product_categories(category_id)')
    .in('sku', skus)
    .eq('is_active', true);
  assert.equal(products.error, null);
  assert.equal(products.data!.length, skus.length);
  const coffee = await db
    .from('categories')
    .select('id')
    .eq('slug', 'coffee-tea')
    .single();
  assert.equal(coffee.error, null);
  console.log(products.data!.map((p) => ({ sku: p.sku, name: p.name })));
  if (mode !== '--apply') return;
  const existing = await db
    .from('categories')
    .select('id')
    .eq('slug', 'plant-based-milks')
    .maybeSingle();
  assert.equal(existing.error, null);
  let categoryId = existing.data?.id;
  if (!categoryId) {
    const category = await db
      .from('categories')
      .insert({
        name: 'Plant-Based Milks',
        slug: 'plant-based-milks',
        display_order: 9,
        is_active: true,
        description:
          'Plant-based milks for your coffee, tea and everyday favorites.',
        meta_title: 'Plant-Based Milks',
        meta_description:
          'Shop plant-based barista milks for your home or café at La Costa Gourmet.',
      })
      .select('id')
      .single();
    assert.equal(category.error, null);
    categoryId = category.data!.id;
  }
  const memberships = products.data!.flatMap((p) =>
    [categoryId!, coffee.data!.id].map((category_id) => ({
      product_id: p.id,
      category_id,
    })),
  );
  const added = await db
    .from('product_categories')
    .upsert(memberships, {
      onConflict: 'product_id,category_id',
      ignoreDuplicates: true,
    });
  assert.equal(added.error, null);
  const verified = await db
    .from('product_categories')
    .select('product_id,category_id')
    .in(
      'product_id',
      products.data!.map((p) => p.id),
    )
    .in('category_id', [categoryId, coffee.data!.id]);
  assert.equal(verified.error, null);
  assert.equal(verified.data!.length, 12);
  console.log(
    `Verified ${skus.length} plant milks in both categories. Primary assignments unchanged.`,
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
