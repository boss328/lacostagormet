BEGIN;

-- A family can contain a single bag, a single can, and several can sizes.
-- Packaging belongs to each SKU; prices and fulfillment remain per product.
CREATE FUNCTION public.product_pack_size_key(p_size text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE measure text[]; unit text;
BEGIN
  IF nullif(btrim(p_size), '') IS NULL THEN RETURN ''; END IF;
  measure := regexp_match(lower(p_size), '([0-9]+(?:\.[0-9]+)?)[[:space:]]*(fl[[:space:]]*oz|lbs?|oz|kg|g|ml|l)(?:\.|[[:space:]]|$)');
  IF measure IS NOT NULL THEN
    unit := regexp_replace(measure[2], '[[:space:]]+', '', 'g');
    IF unit = 'lbs' THEN unit := 'lb'; END IF;
    RETURN trim_scale(measure[1]::numeric)::text || ' ' || unit;
  END IF;
  RETURN regexp_replace(lower(btrim(p_size)), '[[:space:]]+', ' ', 'g');
END;
$$;
REVOKE ALL ON FUNCTION public.product_pack_size_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.product_pack_size_key(text) TO service_role;

DROP INDEX public.products_pack_group_count_key;
CREATE UNIQUE INDEX products_pack_group_size_key
  ON public.products(
    (coalesce(pack_parent_id, id)), units_per_pack,
    (lower(btrim(pack_unit_label))), (public.product_pack_size_key(pack_size))
  ) WHERE pack_unit_label IS NOT NULL AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.configure_product_pack(p_product_id uuid, p_units integer, p_label text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE root_id uuid; parent public.products%ROWTYPE;
BEGIN
  IF p_units IS NULL OR p_units NOT BETWEEN 1 AND 1000 OR p_label IS NULL
     OR char_length(p_label) NOT BETWEEN 1 AND 30 OR p_label <> btrim(p_label)
     OR p_label !~ '^[a-zA-Z][a-zA-Z -]*$' THEN
    RAISE EXCEPTION 'Invalid pack configuration.' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(pack_parent_id, id) INTO root_id FROM public.products WHERE id = p_product_id AND deleted_at IS NULL;
  SELECT * INTO parent FROM public.products WHERE id = root_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found.' USING ERRCODE = 'P0002'; END IF;
  IF parent.units_per_pack IS DISTINCT FROM p_units
     AND EXISTS (SELECT 1 FROM public.products WHERE pack_parent_id = root_id) THEN
    RAISE EXCEPTION 'The original pack count cannot change after options have been created.' USING ERRCODE = '22023';
  END IF;
  -- Changing the original product must never relabel its bag/can siblings.
  UPDATE public.products SET units_per_pack = p_units, pack_unit_label = lower(p_label) WHERE id = root_id;
  RETURN root_id;
END;
$$;
REVOKE ALL ON FUNCTION public.configure_product_pack(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.configure_product_pack(uuid, integer, text) TO service_role;

CREATE OR REPLACE FUNCTION public.create_product_pack_option(p_product_id uuid, p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  root_id uuid;
  parent public.products%ROWTYPE;
  created_id uuid;
  option_units integer;
  parent_units integer;
  option_label text;
  parent_label text;
  option_size text;
  price numeric;
  shipping_weight numeric;
  vendor uuid;
  image_url text;
  available boolean;
BEGIN
  IF p_input IS NULL OR jsonb_typeof(p_input) <> 'object' THEN
    RAISE EXCEPTION 'Invalid pack details.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_input->'sku') IS DISTINCT FROM 'string'
     OR (p_input->>'sku') !~ '^[a-zA-Z0-9_-]{2,50}$'
     OR jsonb_typeof(p_input->'slug') IS DISTINCT FROM 'string'
     OR char_length(p_input->>'slug') NOT BETWEEN 2 AND 200
     OR (p_input->>'slug') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     OR jsonb_typeof(p_input->'name') IS DISTINCT FROM 'string'
     OR char_length(btrim(p_input->>'name')) NOT BETWEEN 2 AND 200
     OR jsonb_typeof(p_input->'description') IS DISTINCT FROM 'string'
     OR char_length(btrim(p_input->>'description')) NOT BETWEEN 10 AND 5000
     OR jsonb_typeof(p_input->'retail_price') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_input->'weight_lb') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_input->'units_per_pack') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_input->'parent_units_per_pack') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_input->'pack_unit_label') IS DISTINCT FROM 'string'
     OR (p_input ? 'parent_pack_unit_label' AND jsonb_typeof(p_input->'parent_pack_unit_label') IS DISTINCT FROM 'string')
     OR (p_input ? 'pack_size' AND jsonb_typeof(p_input->'pack_size') NOT IN ('string', 'null'))
     OR jsonb_typeof(p_input->'vendor_id') IS DISTINCT FROM 'string'
     OR (p_input ? 'is_active' AND jsonb_typeof(p_input->'is_active') <> 'boolean')
     OR coalesce(p_input->>'stock_status', 'out_of_stock') NOT IN ('in_stock','low_stock','out_of_stock','discontinued') THEN
    RAISE EXCEPTION 'Invalid pack details.' USING ERRCODE = '22023';
  END IF;
  price := (p_input->>'retail_price')::numeric;
  shipping_weight := (p_input->>'weight_lb')::numeric;
  IF price NOT BETWEEN 0.01 AND 99999999.99 OR price <> round(price, 2)
     OR shipping_weight NOT BETWEEN 0.01 AND 9999.99 OR shipping_weight <> round(shipping_weight, 2)
     OR (p_input->>'units_per_pack')::numeric <> trunc((p_input->>'units_per_pack')::numeric)
     OR (p_input->>'parent_units_per_pack')::numeric <> trunc((p_input->>'parent_units_per_pack')::numeric)
     OR (p_input->>'units_per_pack')::numeric NOT BETWEEN 1 AND 1000
     OR (p_input->>'parent_units_per_pack')::numeric NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Invalid pack price, shipping weight, or count.' USING ERRCODE = '22023';
  END IF;
  option_units := (p_input->>'units_per_pack')::integer;
  parent_units := (p_input->>'parent_units_per_pack')::integer;
  option_label := lower(btrim(p_input->>'pack_unit_label'));
  parent_label := lower(btrim(p_input->>'parent_pack_unit_label'));
  option_size := btrim(p_input->>'pack_size');
  IF char_length(option_label) NOT BETWEEN 1 AND 30 OR option_label !~ '^[a-z][a-z -]*$'
     OR (parent_label IS NOT NULL AND (char_length(parent_label) NOT BETWEEN 1 AND 30 OR parent_label !~ '^[a-z][a-z -]*$'))
     OR (option_size IS NOT NULL AND char_length(option_size) NOT BETWEEN 1 AND 200) THEN
    RAISE EXCEPTION 'Invalid package label or net contents.' USING ERRCODE = '22023';
  END IF;
  vendor := (p_input->>'vendor_id')::uuid;
  PERFORM 1 FROM public.vendors WHERE id = vendor AND is_active AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose an active fulfillment vendor.' USING ERRCODE = '22023'; END IF;
  available := coalesce((p_input->>'is_active')::boolean, false);
  image_url := nullif(p_input->>'primary_image_url', '');

  -- Serialize family writes before deciding whether the root needs configuration.
  SELECT coalesce(pack_parent_id, id) INTO root_id FROM public.products WHERE id = p_product_id AND deleted_at IS NULL;
  SELECT * INTO parent FROM public.products WHERE id = root_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found.' USING ERRCODE = 'P0002'; END IF;
  IF parent.pack_unit_label IS NULL THEN
    root_id := public.configure_product_pack(root_id, parent_units, coalesce(parent_label, option_label));
    SELECT * INTO parent FROM public.products WHERE id = root_id;
  ELSIF parent.units_per_pack IS DISTINCT FROM parent_units
     OR (parent_label IS NOT NULL AND parent_label <> lower(parent.pack_unit_label)) THEN
    RAISE EXCEPTION 'The original product configuration changed. Refresh before adding an option.' USING ERRCODE = '22023';
  END IF;
  -- Legacy callers without net contents cannot create an ambiguous copy of
  -- a known package. Explicit sizes allow multiple same-count cans or bags.
  IF option_size IS NULL AND EXISTS (
    SELECT 1 FROM public.products
    WHERE (id = root_id OR pack_parent_id = root_id) AND deleted_at IS NULL
      AND units_per_pack = option_units AND lower(pack_unit_label) = option_label
  ) THEN
    RAISE EXCEPTION 'This package already exists. Supply a distinct net size.' USING ERRCODE = '23505';
  END IF;
  IF image_url IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.product_images image
    JOIN public.products product ON product.id = image.product_id
    WHERE image.url = image_url AND product.deleted_at IS NULL
      AND (product.id = root_id OR product.pack_parent_id = root_id)
  ) THEN
    RAISE EXCEPTION 'Choose an uploaded image from this product group.' USING ERRCODE = '22023';
  END IF;
  IF available AND image_url IS NULL THEN
    RAISE EXCEPTION 'Choose a product image before publishing this pack option.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.products (
    sku, name, slug, brand_id, primary_category_id, description,
    retail_price, units_per_pack, pack_parent_id, pack_unit_label, pack_size,
    weight_lb, preferred_vendor_id, stock_status, is_active, is_featured
  ) VALUES (
    p_input->>'sku', btrim(p_input->>'name'), p_input->>'slug', parent.brand_id,
    parent.primary_category_id, btrim(p_input->>'description'), price, option_units,
    root_id, option_label, option_size, shipping_weight, vendor,
    coalesce(p_input->>'stock_status', 'out_of_stock'), available, false
  ) RETURNING id INTO created_id;

  -- Never inherit the case UPC, dimensions, wholesale cost, net contents,
  -- marketing copy, nutrition claims, or shipping weight onto the new SKU.
  INSERT INTO public.product_categories(product_id, category_id)
    SELECT created_id, category_id FROM public.product_categories WHERE product_id = root_id
    ON CONFLICT DO NOTHING;
  IF parent.primary_category_id IS NOT NULL THEN
    INSERT INTO public.product_categories(product_id, category_id)
      VALUES(created_id, parent.primary_category_id) ON CONFLICT DO NOTHING;
  END IF;
  IF image_url IS NOT NULL THEN
    INSERT INTO public.product_images(product_id, url, alt_text, is_primary, display_order)
      VALUES(created_id, image_url, btrim(p_input->>'name'), true, 0);
  END IF;
  RETURN created_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_product_pack_option(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_product_pack_option(uuid, jsonb) TO service_role;

COMMENT ON COLUMN public.products.pack_unit_label IS 'Singular container unit for this SKU, for example bag or can. Siblings may use different containers and net sizes. Null leaves legacy products unchanged.';
NOTIFY pgrst, 'reload schema';
COMMIT;
