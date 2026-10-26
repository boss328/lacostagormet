import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const localVendor = '955d0d6a-e391-47dc-aab9-a95f1daeb810';
const supplierVendor = '96d65a1a-3737-4686-90f5-ce817761c592';
const brand = '33333333-3333-4333-8333-333333333333';
const primaryCategory = '44444444-4444-4444-8444-444444444444';
const extraCategory = '55555555-5555-4555-8555-555555555555';
const cases = [
  { id: '8b77e7e6-cd95-4369-84a6-6967356a3a6b', singleId: '99f3ce00-c6c8-4c14-8c70-b10d2631567c', sku: 'EV4B', old: 188.95, price: 170, singleOld: 51.96, singlePrice: 47, lb: 4, weight: 4.25 },
  { id: '959a81cb-d7b9-4e71-a7c6-902b42cda948', singleId: '6b4ea13a-1954-4074-b172-ee6ca0944195', sku: 'FV4B', old: 188.95, price: 190, singleOld: 51.96, singlePrice: 50, lb: 3, weight: 3.26 },
  { id: 'e980b821-9093-4d13-8dd8-c879a998b1ba', singleId: 'e3323a06-b339-44de-9339-1ccd77d95b36', sku: 'OS4B', old: 188.95, price: 190, singleOld: 51.96, singlePrice: 50, lb: 3, weight: 3.25 },
  { id: '1ea7b073-55ab-471e-8fc5-9fec30ffb5fc', singleId: '25b38a92-da51-4ceb-b37f-bf8d1b37a2d7', sku: 'OPC3B', old: 189, price: 189, singleOld: 51.98, singlePrice: 49, lb: 3, weight: 3.25 },
  { id: '781fc195-ea9a-49bd-bc3d-1524734ec0d5', singleId: '6f0df916-7bde-4f80-bbe2-88aeaa936ea0', sku: 'TS4B', old: 188.95, price: 170, singleOld: 51.96, singlePrice: 47, lb: 4, weight: 4.25 },
];
type Row = Record<string, unknown>;

async function fixture() {
  const db = new PGlite();
  await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE DOMAIN citext AS text; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
  await db.exec((await readFile('supabase/migrations/0001_initial_schema.sql', 'utf8')).replace('CREATE EXTENSION IF NOT EXISTS citext;', ''));
  for (const file of ['0007_add_product_upc.sql', '20261025214603_product_pack_options.sql']) {
    await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
  }
  await db.exec(`
    GRANT USAGE ON SCHEMA public TO anon,service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
    ALTER TABLE products ENABLE ROW LEVEL SECURITY;
    ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON products,product_images TO anon;
    CREATE POLICY products_public ON products FOR SELECT TO anon USING(is_active AND deleted_at IS NULL);
    CREATE POLICY images_public ON product_images FOR SELECT TO anon USING(EXISTS(SELECT 1 FROM products WHERE id=product_id));
    INSERT INTO vendors(id,name,slug,is_self_fulfilled) VALUES
      ('${localVendor}','Home/Garage','home-garage',true),('${supplierVendor}','David Rio','david-rio',false);
    INSERT INTO brands(id,name,slug) VALUES('${brand}','David Rio','david-rio');
    INSERT INTO categories(id,name,slug) VALUES('${primaryCategory}','Chai','chai'),('${extraCategory}','Tea','tea');
    SET ROLE service_role;
  `);
  for (const item of cases) {
    await db.query(`INSERT INTO products(id,sku,name,slug,retail_price,units_per_pack,pack_unit_label,weight_lb,wholesale_cost,
      preferred_vendor_id,upc,pack_size,description,brand_id,primary_category_id,is_featured)
      VALUES($1,$2,$3,$4,$5,4,'bag',$6,$7,$8,$9,$10,'Original four-bag supplier case description',$11,$12,true)`,
    [item.id,item.sku,`${item.sku} original four-bag case`,`${item.sku.toLowerCase()}-four-bags`,item.old,item.weight * 4,
      item.sku === 'EV4B' ? 123.45 : null,supplierVendor,`${item.sku}-CASE-UPC`,`Four ${item.lb} lb. Bags`,brand,primaryCategory]);
    await db.query(`INSERT INTO products(id,sku,name,slug,retail_price,units_per_pack,pack_unit_label,pack_parent_id,weight_lb,
      preferred_vendor_id,pack_size,description,brand_id,primary_category_id,is_active,stock_status)
      VALUES($1,$2,$3,$4,$5,1,'bag',$6,$7,$8,$9,'Original single-bag description',$10,$11,false,'out_of_stock')`,
    [item.singleId,`${item.sku}-1`,`${item.sku} original single`,`${item.sku.toLowerCase()}-single`,item.singleOld,item.id,item.weight,
      localVendor,`One ${item.lb} lb. Bag`,brand,primaryCategory]);
    for (const id of [item.id,item.singleId]) {
      await db.query('INSERT INTO product_categories(product_id,category_id) VALUES($1,$2)', [id,extraCategory]);
      await db.query("INSERT INTO product_images(product_id,url,alt_text,is_primary) VALUES($1,$2,'Existing image',true)", [id,`https://images.example/${id}.png`]);
    }
  }
  // Actual order schema: price/cost/name/vendor snapshots must never be rewritten.
  const order = (await db.query<{ id: string }>(`INSERT INTO orders(customer_email,status,subtotal,total,shipping_address,billing_address)
    VALUES('pricing-fixture@example.invalid','paid',377.95,377.95,'{}','{}') RETURNING id`)).rows[0];
  for (const item of [cases[0],cases[3]]) {
    await db.query(`INSERT INTO order_items(order_id,product_id,product_sku,product_name,quantity,unit_price,
      unit_wholesale_cost,line_subtotal,assigned_vendor_id) VALUES($1,$2,$3,$4,1,$5,88.88,$5,$6)`,
    [order.id,item.id,item.sku,`${item.sku} historical four-bag case`,item.old,supplierVendor]);
  }
  await db.query(`INSERT INTO vendor_orders(order_id,vendor_id,status,email_subject,email_body)
    VALUES($1,$2,'pending','Historical supplier PO','Please ship the original four-bag cases.')`, [order.id,supplierVendor]);
  return db;
}

async function snapshot(db: PGlite) {
  return {
    products: (await db.query<Row>('SELECT * FROM products ORDER BY sku')).rows,
    images: (await db.query<Row>('SELECT * FROM product_images ORDER BY product_id,url,id')).rows,
    categories: (await db.query<Row>('SELECT * FROM product_categories ORDER BY product_id,category_id')).rows,
    orders: (await db.query<Row>('SELECT * FROM orders ORDER BY id')).rows,
    orderItems: (await db.query<Row>('SELECT * FROM order_items ORDER BY id')).rows,
    supplierOrders: (await db.query<Row>('SELECT * FROM vendor_orders ORDER BY id')).rows,
  };
}

async function main() {
  const sql = await readFile('scripts/sql/apply-approved-david-rio-prices.sql', 'utf8');
  const db = await fixture();
  let guarded = 0;
  async function rejectsAtomically(pattern: RegExp) {
    const changed = await snapshot(db);
    await assert.rejects(db.exec(sql), pattern);
    await db.exec('ROLLBACK');
    assert.deepEqual(await snapshot(db), changed, 'failure preserves every pre-existing product, image, category and order');
    guarded++;
  }
  try {
    const scenarios = [
      ["UPDATE products SET retail_price=55 WHERE sku='TS4B-1'", "UPDATE products SET retail_price=51.96 WHERE sku='TS4B-1'"],
      ["UPDATE products SET sku='TS4B-DIFFERENT' WHERE sku='TS4B-1'", "UPDATE products SET sku='TS4B-1' WHERE sku='TS4B-DIFFERENT'"],
      [`UPDATE products SET pack_parent_id='${cases[1].id}',units_per_pack=2 WHERE sku='TS4B-1'`, `UPDATE products SET pack_parent_id='${cases[4].id}',units_per_pack=1 WHERE sku='TS4B-1'`],
      ["UPDATE products SET units_per_pack=2 WHERE sku='TS4B-1'", "UPDATE products SET units_per_pack=1 WHERE sku='TS4B-1'"],
      ["UPDATE products SET is_active=true WHERE sku='TS4B-1'", "UPDATE products SET is_active=false WHERE sku='TS4B-1'"],
      ["UPDATE products SET stock_status='out_of_stock' WHERE sku='TS4B'", "UPDATE products SET stock_status='in_stock' WHERE sku='TS4B'"],
      [`UPDATE products SET preferred_vendor_id='${supplierVendor}' WHERE sku='TS4B-1'`, `UPDATE products SET preferred_vendor_id='${localVendor}' WHERE sku='TS4B-1'`],
      ["UPDATE products SET deleted_at=now() WHERE sku='TS4B-1'", "UPDATE products SET deleted_at=NULL WHERE sku='TS4B-1'"],
    ];
    for (const [mutate,restore] of scenarios) {
      await db.exec(mutate);
      await rejectsAtomically(/Approved-price product TS4B(?:-1)? changed/);
      await db.exec(restore);
    }
    await db.exec(`UPDATE vendors SET is_self_fulfilled=false WHERE id='${localVendor}'`);
    await rejectsAtomically(/Expected active local and supplier fulfillment vendors changed/);
    await db.exec(`UPDATE vendors SET is_self_fulfilled=true WHERE id='${localVendor}'`);
    await db.exec("UPDATE products SET retail_price=147 WHERE sku='OPC3B'");
    await rejectsAtomically(/Original OPC3B four-bag product changed/);
    await db.exec("UPDATE products SET retail_price=189 WHERE sku='OPC3B'");
    console.log(`PASS: ${guarded} changed-price, identity, family, count, visibility, stock, vendor and deletion guards fail closed`);

    // This conflict is detected after all nine UPDATEs, exercising full rollback.
    await db.exec("INSERT INTO products(sku,name,slug,retail_price) VALUES('OPC3B-3','Unrelated product','unrelated-product',10)");
    await rejectsAtomically(/OPC3B-3 already exists with different pending configuration/);
    await db.exec("DELETE FROM products WHERE sku='OPC3B-3'");
    console.log('PASS: a foreign three-pack SKU rolls back all preceding approved-price updates');

    const before = await snapshot(db);
    await db.exec(sql);
    const after = await snapshot(db);
    assert.equal(after.products.length, before.products.length + 1);
    for (const item of cases) {
      for (const [id,price] of [[item.id,item.price],[item.singleId,item.singlePrice]] as const) {
        const old = before.products.find(product => product.id === id)!;
        const current = after.products.find(product => product.id === id)!;
        const oldFields = { ...old };
        const currentFields = { ...current };
        delete oldFields.updated_at;
        delete currentFields.updated_at;
        assert.deepEqual(currentFields, { ...oldFields, retail_price: price.toFixed(2) }, 'only approved retail prices change');
        if (item.sku === 'OPC3B' && id === item.id) assert.deepEqual(current,old, 'original four-pack remains byte-for-byte unchanged');
      }
    }
    assert.deepEqual(after.orders,before.orders);
    assert.deepEqual(after.orderItems,before.orderItems);
    assert.deepEqual(after.supplierOrders,before.supplierOrders);
    assert.deepEqual(after.images.filter(image => before.images.some(old => old.id === image.id)),before.images);
    assert.deepEqual(after.categories.filter(category => before.products.some(old => old.id === category.product_id)),before.categories);
    console.log('PASS: exact approved customer prices preserve all other original fields, unknown/known costs, shipping weights and historical orders/POs');

    const draft = after.products.find(product => product.sku === 'OPC3B-3')!;
    assert.equal(draft.pack_parent_id,cases[3].id);
    assert.equal(draft.units_per_pack,3);
    assert.equal(draft.pack_unit_label,'bag');
    assert.equal(draft.pack_size,'Three 3 lb. Bags');
    assert.equal(draft.retail_price,'147.00');
    assert.equal(draft.name,'David Rio Power Chai Matcha — Three 3 lb. Bags');
    assert.equal(draft.slug,'david-rio-power-chai-matcha-three-3-lb-bags');
    assert.match(String(draft.description),/^Three 3 lb\. bags.*This listing contains three bags\.$/);
    assert.equal(draft.is_active,false);
    assert.equal(draft.stock_status,'out_of_stock');
    assert.equal(draft.is_featured,false);
    assert.equal(draft.brand_id,brand);
    assert.equal(draft.primary_category_id,primaryCategory);
    for (const field of ['preferred_vendor_id','weight_lb','wholesale_cost','upc','dimensions','ingredients','short_description']) {
      assert.equal(draft[field],null, `no unconfirmed ${field} copied onto a different pack`);
    }
    assert.deepEqual(after.categories.filter(row => row.product_id === draft.id).map(row => row.category_id).sort(),[primaryCategory,extraCategory].sort());
    const images = after.images.filter(image => image.product_id === draft.id);
    assert.equal(images.length,1);
    assert.equal(images[0].url,'https://yrlopskyvkdqxmmlxnat.supabase.co/storage/v1/object/public/product-images/david-rio-packs-20261025/opc3b-3-pack.png');
    assert.equal(images[0].alt_text,'Three 3 lb. bags of David Rio Power Chai Matcha');
    assert.equal(images[0].is_primary,true);
    assert.equal(images[0].display_order,0);
    console.log('PASS: distinct $147 three-pack draft has correct image/count/categories and no guessed cost, UPC, shipping weight or vendor');

    await db.exec('RESET ROLE; SET ROLE anon');
    assert.equal((await db.query('SELECT id FROM products WHERE pack_parent_id IS NOT NULL')).rows.length,0);
    assert.equal((await db.query('SELECT id FROM product_images WHERE product_id=$1',[draft.id])).rows.length,0);
    assert.equal((await db.query('SELECT id FROM products')).rows.length,5);
    await db.exec('RESET ROLE; SET ROLE service_role');
    await db.exec(sql);
    assert.deepEqual(await snapshot(db),after, 'rerun is a true no-op including timestamps and image/category counts');
    console.log('PASS: all six drafts stay hidden under public RLS and an exact rerun is idempotent');

    await db.exec("UPDATE products SET retail_price=188.95 WHERE sku='EV4B'; UPDATE products SET weight_lb=10 WHERE sku='OPC3B-3'");
    await rejectsAtomically(/OPC3B-3 already exists with different pending configuration/);
    assert.equal((await db.query<{ retail_price: string }>("SELECT retail_price FROM products WHERE sku='EV4B'")).rows[0].retail_price,'188.95');
    await db.exec("UPDATE products SET weight_lb=NULL,is_active=true WHERE sku='OPC3B-3'");
    await rejectsAtomically(/OPC3B-3 already exists with different pending configuration/);
    console.log('PASS: changed or published three-pack drafts abort instead of silently overwriting merchant configuration');
  } finally { await db.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
