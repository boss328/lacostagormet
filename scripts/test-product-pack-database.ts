import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

async function main() {
  const db = new PGlite();
  const rootId = '11111111-1111-4111-8111-111111111111';
  const vendorId = '22222222-2222-4222-8222-222222222222';
  let sequence = 0;
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role BYPASSRLS;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      CREATE TABLE vendors(id uuid PRIMARY KEY, name text, is_active boolean DEFAULT true, deleted_at timestamptz);
      CREATE TABLE products(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sku text UNIQUE NOT NULL, name text NOT NULL,
        slug text UNIQUE NOT NULL, brand_id uuid, primary_category_id uuid, description text,
        short_description text, ingredients text, weight_lb numeric(6,2), dimensions jsonb,
        pack_size text, units_per_pack integer, retail_price numeric(10,2) NOT NULL,
        wholesale_cost numeric(10,2), preferred_vendor_id uuid REFERENCES vendors(id),
        meta_title text, meta_description text, tax_class text, upc text,
        is_active boolean NOT NULL DEFAULT true, is_featured boolean NOT NULL DEFAULT false,
        stock_status text NOT NULL DEFAULT 'in_stock', deleted_at timestamptz
      );
      CREATE TABLE product_images(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),product_id uuid NOT NULL REFERENCES products(id),url text NOT NULL,alt_text text,is_primary boolean,display_order integer);
      CREATE TABLE product_categories(product_id uuid NOT NULL REFERENCES products(id),category_id uuid NOT NULL,PRIMARY KEY(product_id,category_id));
      ALTER TABLE products ENABLE ROW LEVEL SECURITY;
      ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
      ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
      GRANT SELECT ON products, product_images, product_categories TO anon, authenticated;
      CREATE POLICY products_public ON products FOR SELECT TO anon, authenticated USING(is_active AND deleted_at IS NULL);
      INSERT INTO vendors(id,name) VALUES('${vendorId}','Local warehouse');
      INSERT INTO products(id,sku,name,slug,retail_price,units_per_pack,weight_lb,wholesale_cost,upc,pack_size,description,brand_id,primary_category_id)
      VALUES('${rootId}','CASE','Chai case','chai-case',188.95,NULL,13,99,'CASE-UPC','4 bags','Case copy',gen_random_uuid(),'33333333-3333-4333-8333-333333333333');
      INSERT INTO product_images(product_id,url,is_primary,display_order) VALUES('${rootId}','https://images.example/chai.jpg',true,0);
      INSERT INTO product_categories(product_id,category_id) VALUES('${rootId}','44444444-4444-4444-8444-444444444444');
    `);
    await db.exec(await readFile('supabase/migrations/20261025214603_product_pack_options.sql', 'utf8'));
    await db.exec('SET ROLE service_role');
    const input = (override: Record<string, unknown> = {}) => ({
      sku: `PACK-${++sequence}`, slug: `chai-pack-${sequence}`, name: 'Chai single bag', description: 'One bag of chai mix.',
      retail_price: 51.96, units_per_pack: 1, parent_units_per_pack: 4, pack_unit_label: 'bag', weight_lb: 3.25,
      vendor_id: vendorId, ...override,
    });
    const create = async (values: Record<string, unknown>, id = rootId) => (await db.query<{ id: string }>(
      'SELECT public.create_product_pack_option($1::uuid,$2::jsonb) AS id', [id, JSON.stringify(values)],
    )).rows[0].id;
    const product = async (id: string) => (await db.query<Record<string, unknown>>('SELECT * FROM products WHERE id=$1', [id])).rows[0];
    const count = async () => (await db.query<{ count: number }>('SELECT count(*)::integer AS count FROM products')).rows[0].count;

    // A failure after original-pack configuration must roll that update back too.
    await assert.rejects(create(input({ primary_image_url: 'https://other.example/unapproved.jpg' })), /uploaded image/);
    assert.equal((await product(rootId)).units_per_pack, null);
    assert.equal((await product(rootId)).pack_unit_label, null);
    assert.equal(await count(), 1);

    const childId = await create(input({ upc: 'injected-case-upc', wholesale_cost: 50, is_featured: true }));
    const child = await product(childId);
    assert.equal(child.pack_parent_id, rootId);
    assert.equal(child.units_per_pack, 1);
    assert.equal(child.retail_price, '51.96');
    assert.equal(child.weight_lb, '3.25');
    assert.equal(child.preferred_vendor_id, vendorId);
    assert.equal(child.is_active, false);
    assert.equal(child.stock_status, 'out_of_stock');
    assert.equal(child.upc, null);
    assert.equal(child.wholesale_cost, null);
    assert.equal(child.pack_size, null);
    assert.equal(child.is_featured, false);
    assert.equal((await product(rootId)).retail_price, '188.95');
    assert.equal((await product(rootId)).units_per_pack, 4);
    assert.equal((await db.query('SELECT * FROM product_categories WHERE product_id=$1', [childId])).rows.length, 2);
    assert.equal((await db.query('SELECT * FROM product_images WHERE product_id=$1', [childId])).rows.length, 0);
    console.log('PASS: safe draft creation, explicit fulfillment and weights, categories copied, case claims excluded');

    await assert.rejects(create(input()), /unique constraint/);
    await assert.rejects(create(input({ units_per_pack: 4 })), /already belongs/);
    await assert.rejects(create(input({ units_per_pack: 2, parent_units_per_pack: 6 })), /cannot change/);
    for (const override of [
      { units_per_pack: 1.5 }, { units_per_pack: 1001 }, { retail_price: 0 }, { retail_price: 1.005 },
      { weight_lb: 0 }, { weight_lb: 10000 }, { stock_status: 'anything' }, { vendor_id: null },
      { is_active: true }, { is_active: 'true' }, { pack_unit_label: '<b>bag</b>' },
    ]) await assert.rejects(create(input({ units_per_pack: 2, ...override })));
    assert.equal(await count(), 2);
    console.log('PASS: duplicate counts and invalid stock, pricing, weight, vendor and publication rejected atomically');

    const publishedId = await create(input({ units_per_pack: 2, primary_image_url: 'https://images.example/chai.jpg', is_active: true }), childId);
    assert.equal((await product(publishedId)).pack_parent_id, rootId, 'creating through a child still targets the root');
    assert.equal((await db.query('SELECT * FROM product_images WHERE product_id=$1', [publishedId])).rows.length, 1);
    await db.query('SELECT configure_product_pack($1,4,$2)', [childId, 'pouch']);
    assert.equal((await product(rootId)).pack_unit_label, 'pouch');
    assert.equal((await product(childId)).pack_unit_label, 'pouch');
    await assert.rejects(db.query('SELECT configure_product_pack($1,6,$2)', [rootId, 'bag']), /cannot change/);
    await assert.rejects(db.query('UPDATE products SET units_per_pack=6 WHERE id=$1', [rootId]), /cannot change/);
    await assert.rejects(db.query('UPDATE products SET pack_parent_id=$1 WHERE id=$2', [childId, rootId]), /original product/);
    await assert.rejects(db.query('UPDATE products SET pack_parent_id=id WHERE id=$1', [childId]), /itself/);
    await assert.rejects(db.query('UPDATE products SET pack_unit_label=NULL WHERE id=$1', [rootId]), /retain its unit label/);
    console.log('PASS: child lookup resolves root, labels stay consistent, group chains/cycles are rejected');

    // Force a late image insert failure and verify both the SKU and its M2M rows roll back.
    await db.exec('RESET ROLE; ALTER TABLE product_images ADD CONSTRAINT synthetic_fail_image CHECK (alt_text IS DISTINCT FROM \'Fail image fixture\'); SET ROLE service_role');
    await assert.rejects(create(input({ units_per_pack: 3, name: 'Fail image fixture', primary_image_url: 'https://images.example/chai.jpg' })), /synthetic_fail_image/);
    assert.equal(await count(), 3);
    assert.equal((await db.query("SELECT * FROM products WHERE name='Fail image fixture'")).rows.length, 0);
    console.log('PASS: late write failures roll back product, categories and original configuration');

    for (const role of ['anon', 'authenticated']) {
      await db.exec(`RESET ROLE; SET ROLE ${role}`);
      await assert.rejects(db.query('SELECT create_product_pack_option($1,$2::jsonb)', [rootId, JSON.stringify(input({ units_per_pack: 3 }))]), /permission denied/);
      await assert.rejects(db.query('SELECT configure_product_pack($1,4,$2)', [rootId, 'bag']), /permission denied/);
      assert.equal((await db.query('SELECT id FROM products WHERE id=$1', [childId])).rows.length, 0, 'draft hidden by existing product RLS');
      assert.equal((await db.query('SELECT id FROM products WHERE id=$1', [publishedId])).rows.length, 1);
    }
    await db.exec('RESET ROLE');
    const routines = (await db.query<{ prosecdef: boolean; proconfig: string[]; callable: boolean }>(`
      SELECT prosecdef,proconfig,has_function_privilege('anon',p.oid,'EXECUTE') AS callable
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('create_product_pack_option','configure_product_pack','validate_product_pack_group')
    `)).rows;
    assert.equal(routines.length, 3);
    for (const routine of routines) {
      assert.equal(routine.prosecdef, false);
      assert.equal(routine.callable, false);
      assert.ok(routine.proconfig.some(value => value.startsWith('search_path=')));
    }
    console.log('PASS: service-only RPC permissions, existing product RLS and fixed-search-path invoker functions');
  } finally { await db.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
