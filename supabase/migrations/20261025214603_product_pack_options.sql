BEGIN;

-- Each option remains a normal product/SKU, so checkout, order snapshots,
-- stock status and vendor routing continue to operate on the selected pack.
ALTER TABLE public.products
  ADD COLUMN pack_parent_id uuid REFERENCES public.products(id) ON DELETE RESTRICT,
  ADD COLUMN pack_unit_label text,
  ADD CONSTRAINT products_pack_label_check CHECK (
    pack_unit_label IS NULL OR (
      pack_unit_label = btrim(pack_unit_label)
      AND char_length(pack_unit_label) BETWEEN 1 AND 30
      AND pack_unit_label ~ '^[a-zA-Z][a-zA-Z -]*$'
      AND units_per_pack BETWEEN 1 AND 1000
      AND units_per_pack IS NOT NULL
    )
  ),
  ADD CONSTRAINT products_pack_parent_check CHECK (
    pack_parent_id IS NULL OR (pack_parent_id <> id AND pack_unit_label IS NOT NULL)
  );

CREATE INDEX products_pack_parent_idx ON public.products(pack_parent_id) WHERE pack_parent_id IS NOT NULL;
CREATE UNIQUE INDEX products_pack_group_count_key
  ON public.products((coalesce(pack_parent_id, id)), units_per_pack)
  WHERE pack_unit_label IS NOT NULL AND deleted_at IS NULL;

CREATE FUNCTION public.validate_product_pack_group()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE parent public.products%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.pack_parent_id IS NULL
     AND NEW.units_per_pack IS DISTINCT FROM OLD.units_per_pack
     AND EXISTS (SELECT 1 FROM public.products WHERE pack_parent_id = NEW.id) THEN
    RAISE EXCEPTION 'The original pack count cannot change after options have been created.' USING ERRCODE = '23514';
  END IF;
  IF NEW.pack_parent_id IS NOT NULL THEN
    IF NEW.id = NEW.pack_parent_id THEN
      RAISE EXCEPTION 'A pack option cannot reference itself.' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO parent FROM public.products WHERE id = NEW.pack_parent_id FOR UPDATE;
    IF NOT FOUND OR parent.deleted_at IS NOT NULL OR parent.pack_parent_id IS NOT NULL
       OR parent.pack_unit_label IS NULL THEN
      RAISE EXCEPTION 'Pack options must reference a configured original product.' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM public.products WHERE pack_parent_id = NEW.id) THEN
      RAISE EXCEPTION 'An original product with pack options cannot become an option.' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.pack_unit_label IS NULL AND EXISTS (SELECT 1 FROM public.products WHERE pack_parent_id = NEW.id) THEN
    RAISE EXCEPTION 'An original product with pack options must retain its unit label.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_product_pack_group() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_product_pack_group() TO service_role;
CREATE TRIGGER validate_product_pack_group
  BEFORE INSERT OR UPDATE OF pack_parent_id, units_per_pack, pack_unit_label ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.validate_product_pack_group();

CREATE FUNCTION public.configure_product_pack(p_product_id uuid, p_units integer, p_label text)
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
  UPDATE public.products SET units_per_pack = p_units, pack_unit_label = lower(p_label) WHERE id = root_id;
  UPDATE public.products SET pack_unit_label = lower(p_label) WHERE pack_parent_id = root_id;
  RETURN root_id;
END;
$$;
REVOKE ALL ON FUNCTION public.configure_product_pack(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.configure_product_pack(uuid, integer, text) TO service_role;

CREATE FUNCTION public.create_product_pack_option(p_product_id uuid, p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  root_id uuid;
  parent public.products%ROWTYPE;
  created_id uuid;
  option_units integer;
  parent_units integer;
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
  IF option_units = parent_units THEN
    RAISE EXCEPTION 'This pack count already belongs to the original product.' USING ERRCODE = '22023';
  END IF;
  vendor := (p_input->>'vendor_id')::uuid;
  PERFORM 1 FROM public.vendors WHERE id = vendor AND is_active AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose an active fulfillment vendor.' USING ERRCODE = '22023'; END IF;
  available := coalesce((p_input->>'is_active')::boolean, false);
  image_url := nullif(p_input->>'primary_image_url', '');

  root_id := public.configure_product_pack(p_product_id, parent_units, p_input->>'pack_unit_label');
  SELECT * INTO parent FROM public.products WHERE id = root_id FOR UPDATE;
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
    retail_price, units_per_pack, pack_parent_id, pack_unit_label,
    weight_lb, preferred_vendor_id, stock_status, is_active, is_featured
  ) VALUES (
    p_input->>'sku', btrim(p_input->>'name'), p_input->>'slug', parent.brand_id,
    parent.primary_category_id, btrim(p_input->>'description'), price, option_units,
    root_id, parent.pack_unit_label, shipping_weight, vendor,
    coalesce(p_input->>'stock_status', 'out_of_stock'), available, false
  ) RETURNING id INTO created_id;

  -- Deliberately do not copy the case UPC, dimensions, wholesale cost, pack_size,
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

COMMENT ON COLUMN public.products.pack_parent_id IS 'Original product for a related purchasable pack size. One level only; stock and fulfillment remain per SKU.';
COMMENT ON COLUMN public.products.pack_unit_label IS 'Singular unit for price-per-unit display, for example bag or bottle. Null leaves legacy products unchanged.';

NOTIFY pgrst, 'reload schema';
COMMIT;
