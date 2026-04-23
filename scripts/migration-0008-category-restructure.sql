-- 0008_category_restructure.sql
-- La Costa Gourmet — category restructure 6 → 5 (Apr 2026)
--
-- Before:  teas-and-chai, cocoa, frappes, oatmeal-and-grains,
--          smoothie-bases, syrups-and-sauces
-- After:   chai-tea, specialty-beverages, smoothies, oatmeal,
--          protein-and-supplements (new, empty)
--
-- Mapping:
--   teas-and-chai        → chai-tea              (rename)
--   oatmeal-and-grains   → oatmeal               (rename)
--   smoothie-bases       → smoothies             (rename)
--   cocoa                → specialty-beverages   (rename — absorbs others)
--   frappes              → merged into specialty-beverages
--   syrups-and-sauces    → merged into specialty-beverages
--   protein-and-supplements                      (net-new row)
--
-- Idempotent: uses ON CONFLICT for the insert and conditional updates
-- that no-op if the old slugs are already gone.
-- Run inside the Supabase SQL Editor.

BEGIN;

-- 1. Rename in-place (simple cases)
UPDATE categories SET slug = 'chai-tea',
                      name = 'Chai Tea',
                      display_order = 10
 WHERE slug = 'teas-and-chai';

UPDATE categories SET slug = 'smoothies',
                      name = 'Smoothies',
                      display_order = 30
 WHERE slug = 'smoothie-bases';

UPDATE categories SET slug = 'oatmeal',
                      name = 'Oatmeal',
                      display_order = 40
 WHERE slug = 'oatmeal-and-grains';

-- 2. Promote 'cocoa' to the merged 'specialty-beverages' category.
--    We reuse its UUID so every product that was already primary-tagged
--    to cocoa keeps a live primary_category_id — saves work below.
UPDATE categories SET slug = 'specialty-beverages',
                      name = 'Specialty Beverages',
                      display_order = 20
 WHERE slug = 'cocoa';

-- 3. Reassign product_categories rows from frappes + syrups-and-sauces
--    to the merged specialty-beverages category. ON CONFLICT DO NOTHING
--    handles products that already had specialty-beverages (via cocoa)
--    in their M2M set.
INSERT INTO product_categories (product_id, category_id)
SELECT pc.product_id, sb.id
  FROM product_categories pc
  JOIN categories old ON pc.category_id = old.id
                     AND old.slug IN ('frappes', 'syrups-and-sauces')
  JOIN categories sb  ON sb.slug = 'specialty-beverages'
ON CONFLICT (product_id, category_id) DO NOTHING;

-- 4. Remove the now-obsolete product_categories rows pointing at the
--    old frappes / syrups categories (their products have been re-tagged
--    to specialty-beverages in step 3).
DELETE FROM product_categories
 WHERE category_id IN (
       SELECT id FROM categories WHERE slug IN ('frappes', 'syrups-and-sauces')
 );

-- 5. Reassign products.primary_category_id for any row whose primary
--    still points at frappes or syrups-and-sauces.
UPDATE products
   SET primary_category_id = (SELECT id FROM categories WHERE slug = 'specialty-beverages')
 WHERE primary_category_id IN (
       SELECT id FROM categories WHERE slug IN ('frappes', 'syrups-and-sauces')
 );

-- 6. Drop the orphaned frappes + syrups-and-sauces category rows.
DELETE FROM categories
 WHERE slug IN ('frappes', 'syrups-and-sauces');

-- 7. Insert the new empty protein-and-supplements category.
INSERT INTO categories (name, slug, display_order, is_active)
VALUES ('Protein & Supplements', 'protein-and-supplements', 50, true)
ON CONFLICT (slug) DO UPDATE
   SET name = EXCLUDED.name,
       display_order = EXCLUDED.display_order,
       is_active = true;

-- 8. Sanity check: expect exactly 5 active top-level categories in the
--    new display_order sequence.
-- SELECT slug, name, display_order, is_active
--   FROM categories
--  WHERE parent_id IS NULL AND is_active = true
--  ORDER BY display_order;

COMMIT;
