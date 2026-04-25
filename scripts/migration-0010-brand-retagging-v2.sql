-- 0010_brand_retagging_v2.sql
-- La Costa Gourmet — owner walkthrough updates round 2 (Apr 2026)
--
-- This migration is light on the brands table because per-brand category
-- tags ("typology") are stored in src/lib/brand-meta.ts (TS Record), not
-- the database. The TS-side tag updates ship in this commit. SQL only
-- handles the structural changes:
--
--   1. Rename brand: Lotus Plant Energy → Lotus Plant Power
--      (slug, name, and description). Tags update in TS.
--   2. Refresh stub descriptions for Tiki Breeze and Smartfruit
--      to match the new tag focus. Idempotent.
--   3. Patch the legacy vendor_po.signature setting if it still
--      contains the retired (760) phone number.
--
-- NOTE on Smart Fruit: the owner introduced "Smart Fruit" in this
-- walkthrough. The brands table already contains a row with slug
-- 'smartfruit' (display name "Smartfruit") seeded in 0003 and updated
-- in 0009. Treating "Smart Fruit" as the same brand. If the owner
-- later confirms it is a separate label, add a distinct row then.
--
-- Run inside the Supabase SQL Editor.

BEGIN;

-- =============================================================================
-- 1. Brand rename: lotus-plant-energy → lotus-plant-power
--    Idempotent: a row at the new slug short-circuits the old one being
--    renamed (UNIQUE constraint on slug); we handle both shapes.
-- =============================================================================

DO $$
DECLARE
  has_old boolean;
  has_new boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM brands WHERE slug = 'lotus-plant-energy') INTO has_old;
  SELECT EXISTS (SELECT 1 FROM brands WHERE slug = 'lotus-plant-power')  INTO has_new;

  IF has_old AND NOT has_new THEN
    UPDATE brands
       SET slug        = 'lotus-plant-power',
           name        = 'Lotus Plant Power',
           description = 'Plant-based energy drinks.',
           is_active   = true
     WHERE slug = 'lotus-plant-energy';
  ELSIF has_new THEN
    -- New slug already present (re-run, or stub created earlier with
    -- the new name). Make sure name + description match; remove the
    -- stale old-slug row if both happen to exist.
    UPDATE brands
       SET name        = 'Lotus Plant Power',
           description = 'Plant-based energy drinks.',
           is_active   = true
     WHERE slug = 'lotus-plant-power';
    IF has_old THEN
      DELETE FROM brands WHERE slug = 'lotus-plant-energy';
    END IF;
  ELSE
    -- Neither row exists yet (fresh DB or 0009 was never run); insert
    -- the new-slug stub so /brand/lotus-plant-power resolves.
    INSERT INTO brands (name, slug, description, is_active)
    VALUES ('Lotus Plant Power',
            'lotus-plant-power',
            'Plant-based energy drinks.',
            true);
  END IF;
END $$;

-- =============================================================================
-- 2. Refresh stub descriptions for Tiki Breeze + Smartfruit so the
--    /brand pages read in line with the new tag focus.
--    No-op if the rows are missing (e.g., 0009 not yet run).
-- =============================================================================

UPDATE brands
   SET description = 'Energy, syrup, and smoothie blends with a tropical lean.'
 WHERE slug = 'tiki-breeze';

UPDATE brands
   SET description = 'Whole-fruit purées and beverage refreshers.'
 WHERE slug = 'smartfruit';

-- =============================================================================
-- 3. Patch any leftover vendor_po.signature setting that still carries
--    the retired (760) 931-1028 number. The active codepath for new
--    deploys reads from `src/app/admin/(shell)/settings/page.tsx`
--    which already uses the new number; this UPDATE handles existing
--    rows mutated via the admin UI before today.
-- =============================================================================

UPDATE settings
   SET value = to_jsonb(replace(value::text, '(760) 931-1028', '(858) 354-1120'))
 WHERE key = 'vendor_po.signature'
   AND value::text LIKE '%(760) 931-1028%';

-- =============================================================================
-- 4. Sanity check (uncomment to verify after run)
-- =============================================================================
-- SELECT slug, name, is_active FROM brands
--  WHERE slug IN ('lotus-plant-energy', 'lotus-plant-power', 'tiki-breeze', 'smartfruit')
--  ORDER BY slug;
--
-- SELECT key, value FROM settings WHERE key = 'vendor_po.signature';

COMMIT;
