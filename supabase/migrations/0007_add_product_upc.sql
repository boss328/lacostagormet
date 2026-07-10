-- 0007_add_product_upc.sql
-- Adds an optional UPC (barcode / GTIN-12) column to products.
--
-- Apply manually via Supabase SQL Editor (matching how 0001–0006 were
-- applied — not via CLI migration tool).
--
-- Nullable free-form text: the admin product forms trim whitespace but do
-- no format validation, and null means "unknown / not entered".

BEGIN;

ALTER TABLE products
  ADD COLUMN upc text;

COMMENT ON COLUMN products.upc IS
  'Optional product UPC / barcode (GTIN-12). Free-form text; null when unknown.';

COMMIT;
