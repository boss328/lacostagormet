-- Customer prices approved October 25, 2026. This is a guarded data update,
-- not a replacement for the original pack seed or a schema migration.
-- Existing four-bag OPC3B keeps its identity, price and supplier fulfillment.
-- OPC3B-3 is a separate hidden draft until fulfillment and boxed weight are confirmed.
BEGIN;
DO $pricing$
DECLARE
  item jsonb;
  product public.products%ROWTYPE;
  parent public.products%ROWTYPE;
  draft public.products%ROWTYPE;
  draft_id uuid;
  expected_categories uuid[];
  local_vendor constant uuid := '955d0d6a-e391-47dc-aab9-a95f1daeb810';
  supplier_vendor constant uuid := '96d65a1a-3737-4686-90f5-ce817761c592';
  opc_root constant uuid := '1ea7b073-55ab-471e-8fc5-9fec30ffb5fc';
  draft_name constant text := 'David Rio Power Chai Matcha — Three 3 lb. Bags';
  draft_slug constant text := 'david-rio-power-chai-matcha-three-3-lb-bags';
  draft_description constant text := 'Three 3 lb. bags of David Rio Power Chai Matcha. A sweetened chai and matcha blend for hot, iced or blended drinks. This listing contains three bags.';
  draft_image constant text := 'https://yrlopskyvkdqxmmlxnat.supabase.co/storage/v1/object/public/product-images/david-rio-packs-20261025/opc3b-3-pack.png';
  draft_alt constant text := 'Three 3 lb. bags of David Rio Power Chai Matcha';
  changes constant jsonb := $catalog$[
    {"id":"8b77e7e6-cd95-4369-84a6-6967356a3a6b","sku":"EV4B","parent":null,"count":4,"old":188.95,"price":170},
    {"id":"959a81cb-d7b9-4e71-a7c6-902b42cda948","sku":"FV4B","parent":null,"count":4,"old":188.95,"price":190},
    {"id":"e980b821-9093-4d13-8dd8-c879a998b1ba","sku":"OS4B","parent":null,"count":4,"old":188.95,"price":190},
    {"id":"781fc195-ea9a-49bd-bc3d-1524734ec0d5","sku":"TS4B","parent":null,"count":4,"old":188.95,"price":170},
    {"id":"99f3ce00-c6c8-4c14-8c70-b10d2631567c","sku":"EV4B-1","parent":"8b77e7e6-cd95-4369-84a6-6967356a3a6b","count":1,"old":51.96,"price":47},
    {"id":"6b4ea13a-1954-4074-b172-ee6ca0944195","sku":"FV4B-1","parent":"959a81cb-d7b9-4e71-a7c6-902b42cda948","count":1,"old":51.96,"price":50},
    {"id":"e3323a06-b339-44de-9339-1ccd77d95b36","sku":"OS4B-1","parent":"e980b821-9093-4d13-8dd8-c879a998b1ba","count":1,"old":51.96,"price":50},
    {"id":"25b38a92-da51-4ceb-b37f-bf8d1b37a2d7","sku":"OPC3B-1","parent":"1ea7b073-55ab-471e-8fc5-9fec30ffb5fc","count":1,"old":51.98,"price":49},
    {"id":"6f0df916-7bde-4f80-bbe2-88aeaa936ea0","sku":"TS4B-1","parent":"781fc195-ea9a-49bd-bc3d-1524734ec0d5","count":1,"old":51.96,"price":47}
  ]$catalog$::jsonb;
BEGIN
  -- Lock all existing family rows in a consistent order before checking state.
  -- Root locks also serialize creation of other pack options through the trigger.
  PERFORM id FROM public.products
    WHERE id=opc_root OR id IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(changes))
    ORDER BY id FOR UPDATE;
  PERFORM id FROM public.vendors WHERE id IN (local_vendor,supplier_vendor) ORDER BY id FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id=local_vendor AND is_self_fulfilled AND is_active AND deleted_at IS NULL)
     OR NOT EXISTS (SELECT 1 FROM public.vendors WHERE id=supplier_vendor AND NOT is_self_fulfilled AND is_active AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Expected active local and supplier fulfillment vendors changed; review instead of overwriting.';
  END IF;

  SELECT * INTO parent FROM public.products WHERE id=opc_root;
  IF NOT FOUND OR ROW(parent.sku,parent.pack_parent_id,parent.units_per_pack,parent.pack_unit_label,
      parent.is_active,parent.stock_status,parent.preferred_vendor_id,parent.deleted_at,parent.retail_price)
     IS DISTINCT FROM ROW('OPC3B'::text,NULL::uuid,4,'bag'::text,true,'in_stock'::text,supplier_vendor,NULL::timestamptz,189::numeric) THEN
    RAISE EXCEPTION 'Original OPC3B four-bag product changed; review instead of overwriting.';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(changes)
  LOOP
    SELECT * INTO product FROM public.products WHERE id=(item->>'id')::uuid;
    IF NOT FOUND OR ROW(product.sku,product.pack_parent_id,product.units_per_pack,product.pack_unit_label,
        product.is_active,product.stock_status,product.preferred_vendor_id,product.deleted_at)
       IS DISTINCT FROM ROW(item->>'sku',(item->>'parent')::uuid,(item->>'count')::integer,'bag'::text,
        (item->>'count')::integer=4,
        CASE WHEN (item->>'count')::integer=4 THEN 'in_stock' ELSE 'out_of_stock' END,
        CASE WHEN (item->>'count')::integer=4 THEN supplier_vendor ELSE local_vendor END,NULL::timestamptz)
       OR product.retail_price NOT IN ((item->>'old')::numeric,(item->>'price')::numeric) THEN
      RAISE EXCEPTION 'Approved-price product % changed; review instead of overwriting.', item->>'sku';
    END IF;
  END LOOP;

  -- The only existing-product mutation is retail_price. Cost, stock, photos,
  -- copy, shipping weight, family membership and fulfillment remain untouched.
  FOR item IN SELECT value FROM jsonb_array_elements(changes)
  LOOP
    UPDATE public.products SET retail_price=(item->>'price')::numeric
      WHERE id=(item->>'id')::uuid AND retail_price IS DISTINCT FROM (item->>'price')::numeric;
  END LOOP;

  SELECT array_agg(category_id ORDER BY category_id) INTO expected_categories FROM (
    SELECT category_id FROM public.product_categories WHERE product_id=opc_root
    UNION SELECT parent.primary_category_id WHERE parent.primary_category_id IS NOT NULL
  ) categories;
  SELECT * INTO draft FROM public.products WHERE sku='OPC3B-3' FOR UPDATE;
  IF FOUND THEN
    IF ROW(draft.name,draft.slug,draft.description,draft.pack_size,draft.pack_parent_id,draft.units_per_pack,
        draft.pack_unit_label,draft.retail_price,draft.brand_id,draft.primary_category_id,draft.is_active,
        draft.stock_status,draft.is_featured,draft.preferred_vendor_id,draft.weight_lb,draft.wholesale_cost,draft.upc,draft.deleted_at,
        draft.short_description,draft.ingredients,draft.dimensions,draft.meta_title,draft.meta_description,draft.tax_class)
       IS DISTINCT FROM ROW(draft_name,draft_slug,draft_description,'Three 3 lb. Bags'::text,opc_root,3,
        'bag'::text,147::numeric,parent.brand_id,parent.primary_category_id,false,'out_of_stock'::text,false,
        NULL::uuid,NULL::numeric,NULL::numeric,NULL::text,NULL::timestamptz,
        NULL::text,NULL::text,NULL::jsonb,NULL::text,NULL::text,NULL::text)
       OR (SELECT array_agg(category_id ORDER BY category_id) FROM public.product_categories WHERE product_id=draft.id)
          IS DISTINCT FROM expected_categories
       OR (SELECT count(*) FROM public.product_images WHERE product_id=draft.id) <> 1
       OR NOT EXISTS (SELECT 1 FROM public.product_images WHERE product_id=draft.id AND url=draft_image
          AND alt_text=draft_alt AND is_primary AND display_order=0) THEN
      RAISE EXCEPTION 'OPC3B-3 already exists with different pending configuration; review instead of overwriting.';
    END IF;
  ELSE
    -- No guessed shipping weight, supplier, UPC or cost. The admin can finish
    -- these fields after Jeff confirms how this new three-bag pack is fulfilled.
    INSERT INTO public.products(sku,name,slug,description,pack_size,pack_parent_id,units_per_pack,pack_unit_label,
      retail_price,brand_id,primary_category_id,is_active,stock_status,is_featured,preferred_vendor_id,weight_lb,wholesale_cost,upc)
    VALUES('OPC3B-3',draft_name,draft_slug,draft_description,'Three 3 lb. Bags',opc_root,3,'bag',147,
      parent.brand_id,parent.primary_category_id,false,'out_of_stock',false,NULL,NULL,NULL,NULL)
    RETURNING id INTO draft_id;
    INSERT INTO public.product_categories(product_id,category_id)
      SELECT draft_id,category_id FROM unnest(expected_categories) AS category_id;
    INSERT INTO public.product_images(product_id,url,alt_text,is_primary,display_order)
      VALUES(draft_id,draft_image,draft_alt,true,0);
  END IF;
END;
$pricing$;
COMMIT;
