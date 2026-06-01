-- 0016_chai_matcha_and_frappes_rename.sql
-- La Costa Gourmet — May 2026
--
-- Two related category changes Jeff asked for:
--
-- 1. "Chai Tea" → "Chai & Matcha"
--    Add a fresh row at slug 'chai-and-matcha', migrate every chai-tea
--    product (primary_category_id + product_categories M2M), then drop
--    the old row. New slug → URL change; the corresponding permanent
--    redirect is in src/lib/seo/bc-redirects.mjs.
--
-- 2. "Specialty Beverages" → "Specialty Beverages & Frappes"
--    Display name only. Slug stays 'specialty-beverages' so URLs +
--    indexed pages don't break. Surfaces the word "Frappes" on the
--    homepage tile + category page (Jeff wants this visible again
--    since the April merge absorbed the standalone Frappes category).
--
-- End state: 5 active top-level categories in order
--   chai-and-matcha (10), specialty-beverages (20),
--   smoothies (30), oatmeal (40), protein-and-energy (50)
--
-- Idempotent: ON CONFLICT on the insert and conditional WHERE clauses
-- elsewhere — safe to run twice.
-- Run inside the Supabase SQL Editor against project yrlopskyvkdqxmmlxnat.

BEGIN;

-- 1. Insert the new chai-and-matcha category at display_order 10.
INSERT INTO categories (name, slug, display_order, is_active)
VALUES ('Chai & Matcha', 'chai-and-matcha', 10, true)
ON CONFLICT (slug) DO UPDATE
   SET name = EXCLUDED.name,
       display_order = EXCLUDED.display_order,
       is_active = true;

-- 2. Migrate product_categories M2M rows from chai-tea → chai-and-matcha.
--    ON CONFLICT handles products that somehow already had both tags.
INSERT INTO product_categories (product_id, category_id)
SELECT pc.product_id, n.id
  FROM product_categories pc
  JOIN categories old ON pc.category_id = old.id AND old.slug = 'chai-tea'
  JOIN categories n   ON n.slug = 'chai-and-matcha'
ON CONFLICT (product_id, category_id) DO NOTHING;

DELETE FROM product_categories
 WHERE category_id IN (SELECT id FROM categories WHERE slug = 'chai-tea');

-- 3. Repoint products.primary_category_id off chai-tea.
UPDATE products
   SET primary_category_id = (SELECT id FROM categories WHERE slug = 'chai-and-matcha')
 WHERE primary_category_id IN (SELECT id FROM categories WHERE slug = 'chai-tea');

-- 4. Drop the now-orphaned chai-tea category row.
DELETE FROM categories WHERE slug = 'chai-tea';

-- 5. Rename specialty-beverages display name. Slug unchanged so URLs survive.
UPDATE categories
   SET name = 'Specialty Beverages & Frappes'
 WHERE slug = 'specialty-beverages';

-- 6. Sanity check (uncomment to verify): expect 5 rows in this order.
-- SELECT slug, name, display_order, is_active
--   FROM categories
--  WHERE parent_id IS NULL AND is_active = true
--  ORDER BY display_order;

COMMIT;
