-- 0017_brand_lineup_update.sql
-- La Costa Gourmet — brand lineup update (June 2026)
--
-- Adds six new brand stubs and retires two existing labels.
--
-- ADD (is_active=true so the row + /brand page render; 0 products today, so the
-- storefront tile shows "Coming soon" via BRAND_COMING_SOON in
-- src/lib/brand-meta.ts, which ships alongside this migration). Mirrors the
-- POSSMEI pattern in 0015:
--   Lion Coffee, 1883 Maison Routin, Gosh That's Good, Hollander Chocolate,
--   Finest Call, Ghirardelli
--
-- RETIRE (is_active=false so they drop off the homepage brands grid AND /brand —
-- both filter on is_active):
--   Cafe Essentials — 0 products, clean removal.
--   Mylk Labs       — had 7 active products; per the owner those products are
--                     deactivated too so they leave the storefront with the
--                     brand. Order history is unaffected (order_items snapshot
--                     name/sku). Fully reversible: set is_active back to true.
--
-- The per-brand typology labels live in src/lib/brand-meta.ts.
--
-- Idempotent: the INSERT upserts on slug; the deactivations naturally re-apply.

BEGIN;

-- ── Add six new brand stubs ────────────────────────────────────────────────
INSERT INTO brands (name, slug, description, is_active) VALUES
  ('Lion Coffee',         'lion-coffee',         'COFFEE',             true),
  ('1883 Maison Routin',  '1883-maison-routin',  'SYRUPS & SAUCES',    true),
  ('Gosh That''s Good',   'gosh-thats-good',     'FLAVORS & BASE MIX', true),
  ('Hollander Chocolate', 'hollander-chocolate', 'CHOCOLATE & SAUCES', true),
  ('Finest Call',         'finest-call',         'SYRUP & PUREE',      true),
  ('Ghirardelli',         'ghirardelli',         'CHOCOLATE & SAUCE',  true)
ON CONFLICT (slug) DO UPDATE
   SET name        = EXCLUDED.name,
       description = EXCLUDED.description,
       is_active   = true;

-- ── Retire Mylk Labs: deactivate its products, then the brand ──────────────
UPDATE products
   SET is_active = false
 WHERE brand_id = (SELECT id FROM brands WHERE slug = 'mylk-labs');

UPDATE brands
   SET is_active = false
 WHERE slug IN ('mylk-labs', 'cafe-essentials');

-- Sanity checks (uncomment after run):
-- SELECT slug, name, is_active FROM brands
--   WHERE slug IN ('lion-coffee','1883-maison-routin','gosh-thats-good',
--                  'hollander-chocolate','finest-call','ghirardelli',
--                  'mylk-labs','cafe-essentials')
--   ORDER BY slug;
-- SELECT count(*) AS active_mylk_labs_products FROM products
--   WHERE brand_id = (SELECT id FROM brands WHERE slug = 'mylk-labs') AND is_active;

COMMIT;
