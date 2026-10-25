import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const localVendor = '955d0d6a-e391-47dc-aab9-a95f1daeb810';
const supplierVendor = '22222222-2222-4222-8222-222222222222';
const brand = '33333333-3333-4333-8333-333333333333';
const primaryCategory = '44444444-4444-4444-8444-444444444444';
const additionalCategory = '55555555-5555-4555-8555-555555555555';
const assetBase = 'https://yrlopskyvkdqxmmlxnat.supabase.co/storage/v1/object/public/product-images/david-rio-packs-20261025/';
const cases = [
  { id: '8b77e7e6-cd95-4369-84a6-6967356a3a6b', sku: 'EV4B', price: 188.95, singlePrice: 51.96, lb: 4, shippingWeight: 4.25 },
  { id: '959a81cb-d7b9-4e71-a7c6-902b42cda948', sku: 'FV4B', price: 188.95, singlePrice: 51.96, lb: 3, shippingWeight: 3.26 },
  { id: 'e980b821-9093-4d13-8dd8-c879a998b1ba', sku: 'OS4B', price: 188.95, singlePrice: 51.96, lb: 3, shippingWeight: 3.25 },
  { id: '1ea7b073-55ab-471e-8fc5-9fec30ffb5fc', sku: 'OPC3B', price: 189, singlePrice: 51.98, lb: 3, shippingWeight: 3.25 },
  { id: '781fc195-ea9a-49bd-bc3d-1524734ec0d5', sku: 'TS4B', price: 188.95, singlePrice: 51.96, lb: 4, shippingWeight: 4.25 },
] as const;

type Row = Record<string, unknown>;
type Photo = { id: string; product_id: string; url: string; alt_text: string; is_primary: boolean; display_order: number };

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    CREATE TABLE vendors(id uuid PRIMARY KEY,name text,is_self_fulfilled boolean NOT NULL DEFAULT false,is_active boolean NOT NULL DEFAULT true,deleted_at timestamptz);
    CREATE TABLE products(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),sku text UNIQUE NOT NULL,name text NOT NULL,slug text UNIQUE NOT NULL,
      brand_id uuid,primary_category_id uuid,description text,short_description text,ingredients text,
      weight_lb numeric(6,2),dimensions jsonb,pack_size text,units_per_pack integer,retail_price numeric(10,2) NOT NULL,
      wholesale_cost numeric(10,2),preferred_vendor_id uuid REFERENCES vendors(id),upc text,
      is_active boolean NOT NULL DEFAULT true,is_featured boolean NOT NULL DEFAULT false,
      stock_status text NOT NULL DEFAULT 'in_stock',deleted_at timestamptz
    );
    CREATE TABLE product_images(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),product_id uuid NOT NULL REFERENCES products(id),url text NOT NULL,alt_text text,is_primary boolean,display_order integer);
    CREATE TABLE product_categories(product_id uuid NOT NULL REFERENCES products(id),category_id uuid NOT NULL,PRIMARY KEY(product_id,category_id));
    ALTER TABLE products ENABLE ROW LEVEL SECURITY;
    CREATE POLICY public_products ON products FOR SELECT TO anon,authenticated USING(is_active AND deleted_at IS NULL);
    GRANT SELECT ON products TO anon,authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    INSERT INTO vendors(id,name,is_self_fulfilled) VALUES('${localVendor}','Local warehouse',true),('${supplierVendor}','Original supplier',false);
  `);
  for (const [index, item] of cases.entries()) {
    await db.query(`INSERT INTO products(id,sku,name,slug,retail_price,units_per_pack,weight_lb,wholesale_cost,preferred_vendor_id,upc,pack_size,description,short_description,ingredients,brand_id,primary_category_id,is_active,is_featured,stock_status)
      VALUES($1,$2,$3,$4,$5,$6,$7,99,$8,$9,'Four bags','Original case description','Original case teaser','Original ingredient statement',$10,$11,$12,true,$13)`,
    [item.id,item.sku,`${item.sku} original case`,item.sku.toLowerCase(),item.price,index === 0 ? 4 : null,item.shippingWeight * 4,supplierVendor,`${item.sku}-CASE-UPC`,brand,primaryCategory,index !== 2,index === 1 ? 'low_stock' : 'in_stock']);
    await db.query('INSERT INTO product_categories(product_id,category_id) VALUES($1,$2)', [item.id,additionalCategory]);
    await db.query(`INSERT INTO product_images(product_id,url,alt_text,is_primary,display_order) VALUES
      ($1,$2,'Original front label',true,0),($1,$3,'Original back label',false,2)`,
    [item.id,`https://images.example/${item.sku}-front.jpg`,`https://images.example/${item.sku}-back.jpg`]);
  }
  await db.exec(await readFile('supabase/migrations/20261025214603_product_pack_options.sql', 'utf8'));
  await db.exec('SET ROLE service_role');
  return db;
}

async function snapshot(db: PGlite) {
  return {
    products: (await db.query<Row>('SELECT * FROM products ORDER BY sku')).rows,
    images: (await db.query<Row>('SELECT * FROM product_images ORDER BY product_id,url,id')).rows,
    categories: (await db.query<Row>('SELECT * FROM product_categories ORDER BY product_id,category_id')).rows,
  };
}

async function main() {
  const seed = await readFile('scripts/sql/seed-david-rio-packs.sql', 'utf8');
  const assets = JSON.parse(await readFile('docs/product-pack-images.json', 'utf8')) as { images: Array<{ sku: string; count: number; asset: string }> };
  const db = await fixture();
  try {
    const before = await snapshot(db);
    await db.exec(seed);
    const after = await snapshot(db);
    assert.equal(after.products.length, 10);
    assert.equal(after.products.filter(product => product.pack_parent_id).length, 5);

    for (const item of cases) {
      const original = after.products.find(product => product.id === item.id)!;
      const previous = before.products.find(product => product.id === item.id)!;
      const single = after.products.find(product => product.sku === `${item.sku}-1`)!;
      assert.ok(single, `${item.sku} has a single-pack draft`);
      assert.deepEqual(original, { ...previous, units_per_pack: 4, pack_unit_label: 'bag' }, 'only original count/unit-label configuration changes');
      assert.equal(single.pack_parent_id, item.id);
      assert.equal(single.units_per_pack, 1);
      assert.equal(single.pack_unit_label, 'bag');
      assert.equal(single.retail_price, item.singlePrice.toFixed(2));
      assert.equal(Number(single.retail_price), Math.round(item.price / 4 * 1.10 * 100) / 100, 'proposed single price is the case unit price plus 10%, rounded to cents');
      assert.equal(single.is_active, false);
      assert.equal(single.stock_status, 'out_of_stock');
      assert.equal(single.is_featured, false);
      assert.equal(single.preferred_vendor_id, localVendor);
      assert.equal(single.weight_lb, item.shippingWeight.toFixed(2));
      assert.equal(single.pack_size, `One ${item.lb} lb. bag`);
      assert.match(String(single.name), new RegExp(`One ${item.lb} lb\\. Bag$`));
      assert.match(String(single.description), new RegExp(`^One ${item.lb} lb\\. bag`));
      assert.equal(single.upc, null);
      assert.equal(single.wholesale_cost, null);
      assert.equal(single.short_description, null);
      assert.equal(single.ingredients, null);
      assert.equal(single.dimensions, null);
      assert.equal(single.brand_id, brand);
      assert.equal(single.primary_category_id, primaryCategory);
      assert.deepEqual(after.categories.filter(row => row.product_id === single.id).map(row => row.category_id).sort(), [primaryCategory,additionalCategory].sort());

      const originalPhotos = after.images.filter(image => image.product_id === item.id) as Photo[];
      const singlePhotos = after.images.filter(image => image.product_id === single.id) as Photo[];
      assert.equal(originalPhotos.length, 3);
      assert.equal(singlePhotos.length, 2);
      assert.deepEqual(originalPhotos.filter(image => image.is_primary).map(image => image.url), [`${assetBase}${item.sku.toLowerCase()}-4-pack.png`]);
      assert.deepEqual(singlePhotos.filter(image => image.is_primary).map(image => image.url), [`${assetBase}${item.sku.toLowerCase()}-1-pack.png`]);
      for (const oldPhoto of before.images.filter(image => image.product_id === item.id) as Photo[]) {
        const retained = originalPhotos.find(image => image.id === oldPhoto.id);
        assert.deepEqual(retained, { ...oldPhoto, is_primary: false, display_order: oldPhoto.display_order + 1 });
      }
      assert.equal(singlePhotos.find(image => !image.is_primary)?.url, `https://images.example/${item.sku}-front.jpg`);
      assert.match(singlePhotos.find(image => !image.is_primary)!.alt_text, /Original packaging photo/);
      for (const count of [1,4]) {
        assert.equal(assets.images.filter(image => image.sku === item.sku && image.count === count
          && image.asset.endsWith(`/${item.sku.toLowerCase()}-${count}-pack.png`)).length, 1, 'seed filenames match the generated image manifest');
      }
    }
    console.log('PASS: five hidden, out-of-stock singles have proposed 10% pricing, explicit local routing and correct pack weights/counts');
    console.log('PASS: case prices, stock, visibility, supplier routing and copy remain unchanged; no case UPC/cost/claims copied');
    console.log('PASS: generated photos are primary, original packaging remains available, and all ten asset names match the manifest');

    await db.exec('RESET ROLE; SET ROLE anon');
    assert.equal((await db.query('SELECT id FROM products WHERE pack_parent_id IS NOT NULL')).rows.length, 0, 'single drafts are hidden by public RLS');
    await db.exec('RESET ROLE; SET ROLE service_role');
    await db.exec(seed);
    assert.deepEqual(await snapshot(db), after, 'a repeated seed creates no rows and changes no images or prices');

    const edited = after.products.find(product => product.sku === 'EV4B-1')!;
    await db.query(`UPDATE products SET name='Merchant edited single',description='Merchant approved copy.',retail_price=57.25,weight_lb=4.75,
      stock_status='low_stock',is_active=true,preferred_vendor_id=$1 WHERE id=$2`, [supplierVendor,edited.id]);
    await db.query('UPDATE product_images SET is_primary=false,display_order=display_order+1 WHERE product_id=$1', [edited.id]);
    await db.query("INSERT INTO product_images(product_id,url,alt_text,is_primary,display_order) VALUES($1,'https://images.example/merchant.jpg','Merchant chosen photo',true,0)", [edited.id]);
    await db.query("UPDATE product_images SET is_primary=(url LIKE '%front.jpg') WHERE product_id=$1", [cases[0].id]);
    const editedState = await snapshot(db);
    await db.exec(seed);
    assert.deepEqual(await snapshot(db), editedState, 'rerun preserves merchant price, stock, visibility, routing, weight, copy and photo choices');
    console.log('PASS: public RLS hides draft singles; reruns are idempotent and preserve subsequent merchant edits');
  } finally { await db.close(); }

  const rollback = await fixture();
  try {
    // The fifth case fails only after the seed has attempted the first four.
    await rollback.query('UPDATE products SET retail_price=199.95 WHERE id=$1', [cases[4].id]);
    const before = await snapshot(rollback);
    await assert.rejects(rollback.exec(seed), /Starting case TS4B changed; review instead of overwriting/);
    await rollback.exec('ROLLBACK');
    assert.deepEqual(await snapshot(rollback), before, 'a late case-price conflict rolls back all earlier product/image/category writes');
    console.log('PASS: changed case price aborts the entire seed, including earlier products and image updates');

    await rollback.query('UPDATE products SET retail_price=$1 WHERE id=$2', [cases[4].price,cases[4].id]);
    await rollback.query(`INSERT INTO products(sku,name,slug,retail_price) VALUES('TS4B-1','Existing unrelated product','unrelated-single',10)`);
    const collisionState = await snapshot(rollback);
    await assert.rejects(rollback.exec(seed), /Single SKU TS4B-1 already belongs to another product/);
    await rollback.exec('ROLLBACK');
    assert.deepEqual(await snapshot(rollback), collisionState, 'pre-existing unrelated SKUs are never reassigned or overwritten');
    console.log('PASS: an occupied single SKU aborts atomically instead of overwriting or reassigning it');
  } finally { await rollback.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
