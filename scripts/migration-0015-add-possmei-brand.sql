-- 0015_add_possmei_brand.sql
-- La Costa Gourmet — POSSMEI brand stub (May 2026)
--
-- Insert POSSMEI as a new brand stub (boba supplies). Mirrors the
-- pattern from 0009/0010 (Tiki Breeze, Lotus Plant Power, etc):
-- is_active=true so the brand row + page render, products.brand_id
-- count drives the storefront tile ("Coming soon" today until SKUs
-- ship).
--
-- The per-brand typology label ("Boba") and the BRAND_COMING_SOON
-- inclusion live in src/lib/brand-meta.ts and ship alongside this
-- migration.
--
-- Idempotent: ON CONFLICT(slug) refreshes name/description and forces
-- is_active=true.

BEGIN;

INSERT INTO brands (name, slug, description, is_active) VALUES
  ('POSSMEI',
   'possmei',
   'BOBA',
   true)
ON CONFLICT (slug) DO UPDATE
   SET name        = EXCLUDED.name,
       description = EXCLUDED.description,
       is_active   = true;

-- Sanity check (uncomment after run):
-- SELECT slug, name, description, is_active FROM brands WHERE slug = 'possmei';

COMMIT;
