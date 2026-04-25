-- 0009_brand_retagging.sql
-- La Costa Gourmet — owner walkthrough updates (Apr 2026)
--
-- Two parts:
--   1. Rename the 'protein-and-supplements' category to 'protein-and-energy'.
--   2. Insert two new brand stub rows (Tiki Breeze, Lotus Plant Energy) so
--      they appear in the brand directory with a "Coming soon" item count.
--
-- NOTE on Smart Fruit: the owner's markup mentioned a new brand called
-- "Smart Fruit". The brands table already contains a row with slug
-- 'smartfruit' (display name "Smartfruit") inserted in 0003_seed_data.sql.
-- Treating these as the same brand and NOT inserting a duplicate. If the
-- owner clarifies that Smart Fruit is a different label, add it then.
--
-- NOTE on brand category tags: per-brand typology labels (the small
-- "Frappé · Chai · Cocoa" lines under each brand name) are NOT stored in
-- the brands table. They live in src/lib/brand-meta.ts as a TS Record
-- keyed by slug. Those edits ship with this commit; no SQL needed for
-- the retagging itself.
--
-- Idempotent: uses ON CONFLICT for the inserts and a conditional UPDATE.
-- Run inside the Supabase SQL Editor.

BEGIN;

-- =============================================================================
-- 1. Category rename: protein-and-supplements → protein-and-energy
-- =============================================================================

UPDATE categories
   SET slug = 'protein-and-energy',
       name = 'Protein & Energy'
 WHERE slug = 'protein-and-supplements';

-- =============================================================================
-- 2. New brand stubs — visible in /brand index, zero products today.
--    is_active=true so the brand row + page render. Item count comes from
--    products.brand_id (currently zero), and the UI swaps "0 items" for
--    "Coming soon" using the BRAND_COMING_SOON set in src/lib/brand-meta.ts.
-- =============================================================================

INSERT INTO brands (name, slug, description, is_active) VALUES
  ('Tiki Breeze',
   'tiki-breeze',
   'Tropical specialty beverage mixes.',
   true),
  ('Lotus Plant Energy',
   'lotus-plant-energy',
   'Plant-based energy drinks and protein supplements.',
   true)
ON CONFLICT (slug) DO UPDATE
   SET name        = EXCLUDED.name,
       description = EXCLUDED.description,
       is_active   = true;

-- =============================================================================
-- 3. Sanity check (uncomment to verify after run)
-- =============================================================================
-- SELECT slug, name, is_active
--   FROM categories
--  WHERE slug IN ('protein-and-supplements', 'protein-and-energy');
--
-- SELECT slug, name, is_active
--   FROM brands
--  WHERE slug IN ('tiki-breeze', 'lotus-plant-energy', 'smartfruit')
--  ORDER BY slug;

COMMIT;
