-- Ahron's October 24 catalog audit. Preserve brand/category IDs and product URLs.
-- OatMilk was a category-like brand containing several manufacturers; moving
-- those products first avoids incorrectly submitting them as Minor Figures.
BEGIN;

UPDATE public.categories
   SET name = 'Specialty Beverages'
 WHERE slug = 'specialty-beverages' AND name <> 'Specialty Beverages';

UPDATE public.brands
   SET slug = 'island-oasis'
 WHERE slug = 'island-osis';

DO $$
DECLARE
  old_brand_id uuid;
BEGIN
  SELECT id INTO old_brand_id FROM public.brands WHERE slug = 'oatmilk-2' FOR UPDATE;
  IF old_brand_id IS NULL THEN
    RETURN; -- Already migrated, or this catalog never had the legacy brand.
  END IF;

  -- Stop for review if the catalog changed after this correction was prepared.
  IF EXISTS (
    SELECT 1 FROM public.products WHERE brand_id = old_brand_id
      AND sku NOT IN ('USMK-02032006', 'USMK-01032006', '00661', '00660', '63032', '19096')
  ) THEN
    RAISE EXCEPTION 'Unexpected products in OatMilk; review brand assignments before migrating';
  END IF;

  INSERT INTO public.brands (name, slug, description, is_active)
  SELECT 'Tulip by Hollander', 'tulip-by-hollander', 'Barista oat milks from Tulip by Hollander.', true
  WHERE EXISTS (SELECT 1 FROM public.products WHERE brand_id = old_brand_id AND sku IN ('00661', '00660'))
  ON CONFLICT (slug) DO NOTHING;

  INSERT INTO public.brands (name, slug, is_active)
  SELECT 'Oatly', 'oatly', false
  WHERE EXISTS (SELECT 1 FROM public.products WHERE brand_id = old_brand_id AND sku = '63032')
  ON CONFLICT (slug) DO NOTHING;

  INSERT INTO public.brands (name, slug, is_active)
  SELECT 'Planet Oat', 'planet-oat', false
  WHERE EXISTS (SELECT 1 FROM public.products WHERE brand_id = old_brand_id AND sku = '19096')
  ON CONFLICT (slug) DO NOTHING;

  UPDATE public.products p
     SET brand_id = b.id
    FROM public.brands b
   WHERE p.brand_id = old_brand_id
     AND b.slug = CASE
       WHEN p.sku IN ('00661', '00660') THEN 'tulip-by-hollander'
       WHEN p.sku = '63032' THEN 'oatly'
       WHEN p.sku = '19096' THEN 'planet-oat'
     END;

  UPDATE public.brands
     SET name = 'Minor Figures', slug = 'minor-figures',
         description = 'Barista oat milks from Minor Figures.'
   WHERE id = old_brand_id;
END;
$$;

COMMIT;
