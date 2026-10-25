-- Jeff's five starting SKUs, requested 2026-10-24.
-- Run only after 20261025214603_product_pack_options.sql and asset upload.
-- Singles are HIDDEN, OUT OF STOCK drafts. Prices use a PROPOSED 10% premium.
-- Shipping weights are provisional quarter-case estimates; verify packaged weights before publishing.
-- This transaction leaves existing case prices, stock and supplier routing unchanged.
BEGIN;
DO $seed$
DECLARE
  item jsonb;
  original public.products%ROWTYPE;
  single_id uuid;
  original_photo public.product_images%ROWTYPE;
  base_url constant text := 'https://yrlopskyvkdqxmmlxnat.supabase.co/storage/v1/object/public/product-images/david-rio-packs-20261025/';
  local_vendor constant uuid := '955d0d6a-e391-47dc-aab9-a95f1daeb810';
  case_photo text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.vendors WHERE id=local_vendor AND is_self_fulfilled AND is_active AND deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'Expected active local fulfillment vendor is missing.'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements($catalog$[
  {
    "sku": "EV4B",
    "id": "8b77e7e6-cd95-4369-84a6-6967356a3a6b",
    "flavor": "Elephant Vanilla Chai",
    "price": 188.95,
    "lb": 4,
    "weight": 4.25,
    "description": "One 4 lb. bag of David Rio Elephant Vanilla Chai. A vanilla chai blend with black tea and warming spices, for hot or iced drinks. This listing contains one bag.",
    "singleSku": "EV4B-1",
    "singleName": "David Rio Elephant Vanilla Chai — One 4 lb. Bag",
    "singleSlug": "david-rio-elephant-vanilla-chai-one-4-lb-bag",
    "singlePrice": 51.96
  },
  {
    "sku": "FV4B",
    "id": "959a81cb-d7b9-4e71-a7c6-902b42cda948",
    "flavor": "Flamingo Vanilla Decaffeinated Sugar-Free Chai",
    "price": 188.95,
    "lb": 3,
    "weight": 3.26,
    "description": "One 3 lb. bag of David Rio Flamingo Vanilla Decaffeinated Sugar-Free Chai. A decaffeinated, sugar-free vanilla chai blend for hot or iced drinks. This listing contains one bag.",
    "singleSku": "FV4B-1",
    "singleName": "David Rio Flamingo Vanilla Decaffeinated Sugar-Free Chai — One 3 lb. Bag",
    "singleSlug": "david-rio-flamingo-vanilla-decaffeinated-sugar-free-chai-one-3-lb-bag",
    "singlePrice": 51.96
  },
  {
    "sku": "OS4B",
    "id": "e980b821-9093-4d13-8dd8-c879a998b1ba",
    "flavor": "Orca Spice Sugar-Free Chai",
    "price": 188.95,
    "lb": 3,
    "weight": 3.25,
    "description": "One 3 lb. bag of David Rio Orca Spice Sugar-Free Chai. A sugar-free chai blend for hot or iced drinks. This listing contains one bag.",
    "singleSku": "OS4B-1",
    "singleName": "David Rio Orca Spice Sugar-Free Chai — One 3 lb. Bag",
    "singleSlug": "david-rio-orca-spice-sugar-free-chai-one-3-lb-bag",
    "singlePrice": 51.96
  },
  {
    "sku": "OPC3B",
    "id": "1ea7b073-55ab-471e-8fc5-9fec30ffb5fc",
    "flavor": "Power Chai Matcha",
    "price": 189,
    "lb": 3,
    "weight": 3.25,
    "description": "One 3 lb. bag of David Rio Power Chai Matcha. A sweetened chai and matcha blend for hot, iced or blended drinks. This listing contains one bag.",
    "singleSku": "OPC3B-1",
    "singleName": "David Rio Power Chai Matcha — One 3 lb. Bag",
    "singleSlug": "david-rio-power-chai-matcha-one-3-lb-bag",
    "singlePrice": 51.98
  },
  {
    "sku": "TS4B",
    "id": "781fc195-ea9a-49bd-bc3d-1524734ec0d5",
    "flavor": "Tiger Spice Chai",
    "price": 188.95,
    "lb": 4,
    "weight": 4.25,
    "description": "One 4 lb. bag of David Rio Tiger Spice Chai. A black tea chai blend with cinnamon, cardamom and clove, for hot or iced drinks. This listing contains one bag.",
    "singleSku": "TS4B-1",
    "singleName": "David Rio Tiger Spice Chai — One 4 lb. Bag",
    "singleSlug": "david-rio-tiger-spice-chai-one-4-lb-bag",
    "singlePrice": 51.96
  }
]$catalog$::jsonb)
  LOOP
    SELECT * INTO original FROM public.products WHERE id=(item->>'id')::uuid FOR UPDATE;
    IF NOT FOUND OR original.sku <> item->>'sku' OR original.deleted_at IS NOT NULL
       OR original.retail_price <> (item->>'price')::numeric OR original.pack_parent_id IS NOT NULL
       OR (original.units_per_pack IS NOT NULL AND original.units_per_pack <> 4)
       OR (original.pack_unit_label IS NOT NULL AND original.pack_unit_label <> 'bag') THEN
      RAISE EXCEPTION 'Starting case % changed; review instead of overwriting.', item->>'sku';
    END IF;
    SELECT * INTO original_photo FROM public.product_images
      WHERE product_id=original.id AND url NOT LIKE base_url || '%'
      ORDER BY is_primary DESC NULLS LAST, display_order ASC LIMIT 1;

    SELECT id INTO single_id FROM public.products WHERE sku=item->>'singleSku';
    IF single_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.products WHERE id=single_id AND pack_parent_id=original.id AND units_per_pack=1 AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'Single SKU % already belongs to another product.', item->>'singleSku';
      END IF;
      -- A rerun never changes an existing single's price, visibility, stock, weight or photo.
    ELSE
      single_id := public.create_product_pack_option(original.id, jsonb_build_object(
        'sku',item->>'singleSku','name',item->>'singleName','slug',item->>'singleSlug',
        'description',item->>'description','retail_price',(item->>'singlePrice')::numeric,
        'units_per_pack',1,'parent_units_per_pack',4,'pack_unit_label','bag',
        'weight_lb',(item->>'weight')::numeric,'vendor_id',local_vendor::text,
        'is_active',false,'stock_status','out_of_stock'
      ));
      UPDATE public.products SET pack_size='One ' || (item->>'lb') || ' lb. bag' WHERE id=single_id;
      INSERT INTO public.product_images(product_id,url,alt_text,is_primary,display_order) VALUES (
        single_id,base_url || lower(item->>'sku') || '-1-pack.png',
        'One ' || (item->>'lb') || ' lb. bag of David Rio ' || (item->>'flavor'),true,0
      );
      IF original_photo.id IS NOT NULL THEN
        INSERT INTO public.product_images(product_id,url,alt_text,is_primary,display_order)
        VALUES(single_id,original_photo.url,'Original packaging photo — David Rio ' || (item->>'flavor'),false,1);
      END IF;
    END IF;

    case_photo := base_url || lower(item->>'sku') || '-4-pack.png';
    IF NOT EXISTS (SELECT 1 FROM public.product_images WHERE product_id=original.id AND url=case_photo) THEN
      UPDATE public.product_images SET is_primary=false,display_order=coalesce(display_order,0)+1 WHERE product_id=original.id;
      INSERT INTO public.product_images(product_id,url,alt_text,is_primary,display_order) VALUES (
        original.id,case_photo,'Four ' || (item->>'lb') || ' lb. bags of David Rio ' || (item->>'flavor'),true,0
      );
    END IF;
  END LOOP;
END;
$seed$;
COMMIT;
