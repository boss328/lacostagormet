-- 0012_product_images_bucket.sql
-- La Costa Gourmet — Supabase Storage bucket for admin-uploaded product
-- images (Apr 2026).
--
-- The /admin/products/new form uploads to bucket `product-images` and
-- stores the resulting public URL in product_images.url. This migration
-- creates the bucket idempotently and grants the read policy that lets
-- /storage/v1/object/public/product-images/<key> serve the file.
--
-- Service role (the admin client) writes — anonymous public reads.
--
-- Run inside the Supabase SQL Editor.

BEGIN;

-- =============================================================================
-- 1. Create the bucket if missing. Public read flag at the bucket level
--    is what the next/image loader relies on (no signed URLs).
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- =============================================================================
-- 2. RLS policies on storage.objects for this bucket.
--
--    The Supabase storage schema enables RLS by default. We add three
--    policies for product-images:
--      • anon SELECT (public read)
--      • authenticated SELECT (also public read — same effect, different role)
--      • service_role: bypasses RLS automatically; the upload route uses
--        the service-role key, so no INSERT/UPDATE/DELETE policies are
--        needed for app traffic. Admins editing in the Supabase dashboard
--        also use the service role.
-- =============================================================================

DROP POLICY IF EXISTS product_images_anon_read ON storage.objects;
CREATE POLICY product_images_anon_read
  ON storage.objects
  FOR SELECT
  TO anon
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS product_images_authed_read ON storage.objects;
CREATE POLICY product_images_authed_read
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'product-images');

-- =============================================================================
-- Sanity check (uncomment after run)
-- =============================================================================
-- SELECT id, name, public FROM storage.buckets WHERE id = 'product-images';
-- SELECT polname FROM pg_policy
--  WHERE polrelid = 'storage.objects'::regclass
--    AND polname LIKE 'product_images%';

COMMIT;
