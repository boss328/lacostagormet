import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const migration = readFileSync('supabase/migrations/20261024204100_post_launch_catalog_corrections.sql', 'utf8');
async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE brands (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE NOT NULL, slug text UNIQUE NOT NULL, description text, is_active boolean DEFAULT true);
    CREATE TABLE categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, slug text UNIQUE);
    CREATE TABLE products (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sku text UNIQUE, brand_id uuid REFERENCES brands(id), is_active boolean DEFAULT true, retail_price numeric DEFAULT 25, stock_status text DEFAULT 'in_stock');
    INSERT INTO brands(name,slug) VALUES ('OatMilk','oatmilk-2'), ('Island Oasis','island-osis'), ('Unrelated','unrelated');
    INSERT INTO categories(name,slug) VALUES ('Hot Chocolate','specialty-beverages');
    INSERT INTO products(sku,brand_id,is_active)
      SELECT sku,b.id,sku NOT IN ('63032','19096') FROM brands b,
      unnest(ARRAY['USMK-02032006','USMK-01032006','00661','00660','63032','19096']) sku WHERE b.slug='oatmilk-2';
  `);
  return db;
}

test('catalog correction preserves IDs and availability and assigns actual manufacturers', async () => {
  const db = await fixture();
  try {
    const before = (await db.query('SELECT id,sku,is_active,retail_price,stock_status FROM products ORDER BY sku')).rows;
    const originalBrand = (await db.query("SELECT id FROM brands WHERE slug='oatmilk-2'")).rows[0];
    const originalCategory = (await db.query('SELECT id FROM categories')).rows[0];
    await db.exec(migration);
    assert.deepEqual((await db.query('SELECT id,sku,is_active,retail_price,stock_status FROM products ORDER BY sku')).rows, before);
    assert.deepEqual((await db.query("SELECT id FROM brands WHERE slug='minor-figures'")).rows[0], originalBrand);
    assert.deepEqual((await db.query("SELECT id FROM categories WHERE name='Specialty Beverages'")).rows[0], originalCategory);
    const assignments = (await db.query<{sku:string; name:string}>(`SELECT p.sku,b.name FROM products p JOIN brands b ON b.id=p.brand_id ORDER BY p.sku`)).rows;
    assert.deepEqual(Object.fromEntries(assignments.map(p => [p.sku,p.name])), {
      '00660':'Tulip by Hollander', '00661':'Tulip by Hollander', '19096':'Planet Oat', '63032':'Oatly',
      'USMK-01032006':'Minor Figures', 'USMK-02032006':'Minor Figures',
    });
    assert.equal((await db.query("SELECT id FROM brands WHERE slug='island-oasis'")).rows.length,1);
    assert.equal((await db.query("SELECT id FROM brands WHERE slug IN ('island-osis','oatmilk-2')")).rows.length,0);
    await db.exec(migration);
    assert.deepEqual((await db.query('SELECT p.sku,b.name FROM products p JOIN brands b ON b.id=p.brand_id ORDER BY p.sku')).rows,assignments);
  } finally { await db.close(); }
});

test('unexpected OatMilk products stop the entire migration without partial catalog changes', async () => {
  const db = await fixture();
  try {
    await db.exec("INSERT INTO products(sku,brand_id) SELECT 'NEW-SKU',id FROM brands WHERE slug='oatmilk-2'");
    await assert.rejects(db.exec(migration), /Unexpected products/);
    await db.exec('ROLLBACK');
    assert.equal((await db.query("SELECT id FROM brands WHERE slug='island-osis'")).rows.length,1);
    assert.equal((await db.query("SELECT name FROM categories")).rows[0].name,'Hot Chocolate');
  } finally { await db.close(); }
});

test('a conflicting canonical brand aborts instead of silently merging product ownership', async () => {
  const db = await fixture();
  try {
    await db.exec("INSERT INTO brands(name,slug) VALUES ('Minor Figures','minor-figures')");
    await assert.rejects(db.exec(migration), /unique constraint/);
    await db.exec('ROLLBACK');
    assert.equal((await db.query("SELECT count(*)::int AS n FROM products p JOIN brands b ON b.id=p.brand_id WHERE b.slug='oatmilk-2'")).rows[0].n,6);
  } finally { await db.close(); }
});
