-- Jeff confirmed that he packs singles only. Assign the existing three-bag
-- draft to David Rio; keep it hidden until its remaining details are confirmed.
BEGIN;
DO $fulfillment$
DECLARE
  product public.products%ROWTYPE;
  draft_id constant uuid := '6d53f243-bc0a-4416-9d00-e81f11f36245';
  parent_id constant uuid := '1ea7b073-55ab-471e-8fc5-9fec30ffb5fc';
  supplier_id constant uuid := '96d65a1a-3737-4686-90f5-ce817761c592';
BEGIN
  SELECT * INTO product FROM public.products WHERE id=draft_id FOR UPDATE;
  IF NOT FOUND OR ROW(product.sku,product.pack_parent_id,product.units_per_pack,product.pack_unit_label,
      product.retail_price,product.is_active,product.stock_status,product.weight_lb,product.deleted_at)
     IS DISTINCT FROM ROW('OPC3B-3'::text,parent_id,3,'bag'::text,147::numeric,false,
      'out_of_stock'::text,NULL::numeric,NULL::timestamptz)
     OR (product.preferred_vendor_id IS NOT NULL AND product.preferred_vendor_id <> supplier_id) THEN
    RAISE EXCEPTION 'OPC3B-3 draft changed; review instead of overwriting fulfillment.';
  END IF;

  PERFORM id FROM public.vendors WHERE id=supplier_id FOR SHARE;
  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id=supplier_id
      AND is_active AND NOT is_self_fulfilled AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Expected active David Rio supplier changed; review before assigning fulfillment.';
  END IF;

  -- Skip an already-assigned draft, including its updated_at timestamp.
  UPDATE public.products SET preferred_vendor_id=supplier_id
    WHERE id=draft_id AND preferred_vendor_id IS DISTINCT FROM supplier_id;
END;
$fulfillment$;
COMMIT;
