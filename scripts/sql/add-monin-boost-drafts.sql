-- Jeff's 2026-10-28 email: three $27 singles and a $84 mixed three-pack.
-- One-time guarded catalog addition, not a schema migration. No opening counts supplied.
-- Requires all four images in product-images/monin-boosts-20261029/.
BEGIN;
DO $drafts$
DECLARE
 item jsonb; parent public.products%ROWTYPE; original jsonb; created_id uuid;
 config constant jsonb := $data$[{"parentSku":"M-FX325FP","sku":"M-FX325FP-1","name":"Monin Total Immunity Boost — One 1 Liter Bottle","slug":"monin-total-immunity-boost-one-1-liter-bottle","image":"immunity-single.png","description":"One 1 liter bottle of Monin Total Immunity Boost, a beverage concentrate with vitamins C, D and B3, zinc, and elderberry. Mix into coffee, tea, lemonade, smoothies, or still or sparkling water. This listing contains one bottle.","id":"d65c554a-8600-4b29-a186-1a52659bcff4","parentId":"54d7c9d4-fa1c-4bf3-8213-40ae4c4769be","price":27,"units":1},{"parentSku":"M-FX356FP","sku":"M-FX356FP-1","name":"Monin Hydration Boost — One 1 Liter Bottle","slug":"monin-hydration-boost-one-1-liter-bottle","image":"hydration-single.png","description":"One 1 liter bottle of Monin Hydration Boost, a liquid electrolyte concentrate with magnesium, potassium, and sodium. Made without added sugar or sweeteners, it mixes into hot or cold beverages. This listing contains one bottle.","id":"8d401006-fd6d-4573-a637-3becdedda3e1","parentId":"032a655b-a3f7-4429-9de9-ea0b151b10a9","price":27,"units":1},{"parentSku":"M-FX326FP","sku":"M-FX326FP-1","name":"Monin Energy Boost — One 1 Liter Bottle","slug":"monin-energy-boost-one-1-liter-bottle","image":"energy-single.png","description":"One 1 liter bottle of Monin Energy Boost, a caffeinated beverage concentrate with plant extracts. Mix into iced tea, lemonade, smoothies, or still or sparkling water. Contains caffeine. This listing contains one bottle.","id":"c38fd62e-1b12-4ffd-b1d3-10d66bcbed36","parentId":"9eda58fd-debd-4833-b330-061238bfb3ad","price":27,"units":1}]$data$::jsonb;
BEGIN
 IF EXISTS(SELECT 1 FROM public.products WHERE sku IN ('M-FX325FP-1','M-FX356FP-1','M-FX326FP-1','M-BOOST-MIX3')) THEN
  RAISE EXCEPTION 'Monin additions already exist; review their current settings instead of rerunning.';
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(config) LOOP
  SELECT * INTO parent FROM public.products WHERE id=(item->>'parentId')::uuid FOR UPDATE;
  IF NOT FOUND OR parent.sku <> item->>'parentSku' OR parent.deleted_at IS NOT NULL
   OR parent.retail_price <> 99.95 OR parent.pack_parent_id IS NOT NULL
   OR parent.units_per_pack IS NOT NULL OR parent.pack_unit_label IS NOT NULL OR parent.pack_size IS NOT NULL THEN
    RAISE EXCEPTION 'Case % changed; review before adding a linked single.',item->>'parentSku';
  END IF;
  original := to_jsonb(parent) - ARRAY['pack_size','units_per_pack','pack_unit_label','updated_at'];
  UPDATE public.products SET units_per_pack=4,pack_unit_label='bottle',pack_size='4 × 1 L bottles' WHERE id=parent.id;
  IF (SELECT to_jsonb(p) - ARRAY['pack_size','units_per_pack','pack_unit_label','updated_at'] FROM public.products p WHERE p.id=parent.id) IS DISTINCT FROM original THEN
   RAISE EXCEPTION 'An existing case field changed unexpectedly.';
  END IF;
  created_id := (item->>'id')::uuid;
  INSERT INTO public.products(id,sku,name,slug,brand_id,primary_category_id,description,retail_price,
    pack_parent_id,units_per_pack,pack_unit_label,pack_size,is_active,is_featured,stock_status,weight_lb,preferred_vendor_id,tax_class)
  VALUES(created_id,item->>'sku',item->>'name',item->>'slug',parent.brand_id,parent.primary_category_id,item->>'description',27,
    parent.id,1,'bottle','1 L bottle',false,false,'out_of_stock',NULL,NULL,parent.tax_class);
  INSERT INTO public.product_categories(product_id,category_id)
   SELECT created_id,category_id FROM public.product_categories WHERE product_id=parent.id;
  IF parent.primary_category_id IS NOT NULL THEN
   INSERT INTO public.product_categories(product_id,category_id) VALUES(created_id,parent.primary_category_id) ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO public.product_images(product_id,url,alt_text,is_primary,display_order)
   VALUES(created_id,'https://yrlopskyvkdqxmmlxnat.supabase.co/storage/v1/object/public/product-images/monin-boosts-20261029/' || (item->>'image'),item->>'name',true,0);
 END LOOP;
 INSERT INTO public.products(id,sku,name,slug,brand_id,primary_category_id,description,retail_price,
  units_per_pack,pack_unit_label,pack_size,is_active,is_featured,stock_status,weight_lb,preferred_vendor_id)
 VALUES('25856099-4c80-409c-9c38-d872f671af63'::uuid,'M-BOOST-MIX3','Monin Beverage Boosts — Mixed 3-Pack','monin-beverage-boosts-mixed-three-pack',
  'c87ed06c-5869-4d4a-a472-4e7548c48116','cb941c67-c1fe-4670-995a-5729b44c6283','Three 1 liter bottles of Monin Beverage Boosts: one Total Immunity Boost, one Hydration Boost, and one Energy Boost. Try each concentrate in your favorite drinks. The Energy Boost bottle contains caffeine. This listing contains three bottles, one of each variety.',84,
  3,'bottle','3 × 1 L bottles',false,false,'out_of_stock',NULL,NULL);
 INSERT INTO public.product_categories(product_id,category_id) VALUES
  ('25856099-4c80-409c-9c38-d872f671af63'::uuid,'cb941c67-c1fe-4670-995a-5729b44c6283'),
  ('25856099-4c80-409c-9c38-d872f671af63'::uuid,'a5b8d8a2-d49f-4bcd-bb0a-8f3adc7e25b5');
 INSERT INTO public.product_images(product_id,url,alt_text,is_primary,display_order) VALUES
  ('25856099-4c80-409c-9c38-d872f671af63'::uuid,'https://yrlopskyvkdqxmmlxnat.supabase.co/storage/v1/object/public/product-images/monin-boosts-20261029/mixed-three-pack.png','Monin mixed three-pack: one Immunity, one Hydration and one Energy Boost bottle',true,0);
 -- Original manufacturer photos remain available behind the generated pack composition.
 FOR item IN SELECT value FROM jsonb_array_elements(config) LOOP
  INSERT INTO public.product_images(product_id,url,alt_text,is_primary,display_order) VALUES
   ('25856099-4c80-409c-9c38-d872f671af63'::uuid,'https://yrlopskyvkdqxmmlxnat.supabase.co/storage/v1/object/public/product-images/monin-boosts-20261029/' || (item->>'image'),item->>'name',false,
    CASE item->>'parentSku' WHEN 'M-FX325FP' THEN 1 WHEN 'M-FX356FP' THEN 2 ELSE 3 END);
 END LOOP;
 IF (SELECT count(*) FROM public.products WHERE sku IN ('M-FX325FP-1','M-FX356FP-1','M-FX326FP-1','M-BOOST-MIX3')
   AND NOT is_active AND NOT is_featured AND stock_status='out_of_stock' AND weight_lb IS NULL AND preferred_vendor_id IS NULL
   AND ((units_per_pack=1 AND retail_price=27 AND pack_parent_id IS NOT NULL) OR (sku='M-BOOST-MIX3' AND units_per_pack=3 AND retail_price=84 AND pack_parent_id IS NULL))) <> 4 THEN
  RAISE EXCEPTION 'Draft verification failed.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.product_inventory i JOIN public.products p ON p.id=i.product_id WHERE p.sku IN ('M-FX325FP-1','M-FX356FP-1','M-FX326FP-1','M-BOOST-MIX3')) THEN
  RAISE EXCEPTION 'No stock count was authorized for these new packs.';
 END IF;
END;
$drafts$;
COMMIT;
