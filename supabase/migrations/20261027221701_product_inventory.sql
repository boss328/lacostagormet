BEGIN;

-- Tracking is opt-in. No existing products, opening counts or order history are changed.
CREATE TABLE public.product_inventory (
  product_id uuid PRIMARY KEY REFERENCES public.products(id),
  on_hand integer NOT NULL CHECK (on_hand >= 0),
  reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= on_hand),
  low_stock_threshold integer NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- IDs are historical references, deliberately retained when a pending order/item is deleted.
CREATE TABLE public.inventory_order_allocations (
  order_item_id uuid PRIMARY KEY,
  order_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.product_inventory(product_id),
  quantity integer NOT NULL CHECK (quantity > 0),
  state text NOT NULL CHECK (state IN ('reserved','committed','released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_allocations_order_idx ON public.inventory_order_allocations(order_id);

CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.product_inventory(product_id),
  order_id uuid,
  order_item_id uuid,
  request_id uuid UNIQUE,
  action text NOT NULL CHECK (action IN ('start','add','remove','reserve','commit','release')),
  quantity integer NOT NULL CHECK (quantity >= 0),
  on_hand_after integer NOT NULL CHECK (on_hand_after >= 0),
  reserved_after integer NOT NULL CHECK (reserved_after >= 0 AND reserved_after <= on_hand_after),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_movements_product_idx ON public.inventory_movements(product_id,created_at DESC);
ALTER TABLE public.product_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_order_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_inventory, public.inventory_order_allocations, public.inventory_movements FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE ON public.product_inventory, public.inventory_order_allocations TO service_role;
GRANT SELECT,INSERT ON public.inventory_movements TO service_role;

-- Keep manual pauses and discontinued products paused during order processing.
-- An explicit start/add action can make stocked, configured products available.
-- Availability here uses on_hand; reservations are enforced atomically by the item trigger.
-- This lets an already-reserved checkout retry even when it owns the last unit.
CREATE FUNCTION public.inventory_sync_status(p_product_id uuid, p_activate boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE i public.product_inventory%ROWTYPE; p public.products%ROWTYPE; next_status text;
BEGIN
  SELECT * INTO STRICT p FROM public.products WHERE id=p_product_id FOR NO KEY UPDATE;
  SELECT * INTO STRICT i FROM public.product_inventory WHERE product_id=p_product_id FOR NO KEY UPDATE;
  next_status := p.stock_status;
  IF p.stock_status <> 'discontinued' THEN
    IF i.on_hand=0 OR p.weight_lb IS NULL OR p.weight_lb<=0 OR p.preferred_vendor_id IS NULL THEN
      next_status := 'out_of_stock';
    ELSIF p_activate OR p.stock_status IN ('in_stock','low_stock') THEN
      next_status := CASE WHEN i.on_hand<=i.low_stock_threshold THEN 'low_stock' ELSE 'in_stock' END;
    END IF;
  END IF;
  IF next_status IS DISTINCT FROM p.stock_status THEN
    UPDATE public.products SET stock_status=next_status WHERE id=p_product_id;
  END IF;
END;
$$;

CREATE FUNCTION public.inventory_guard_product_status()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE i public.product_inventory%ROWTYPE;
BEGIN
  SELECT * INTO i FROM public.product_inventory WHERE product_id=NEW.id;
  IF FOUND AND NEW.stock_status IN ('in_stock','low_stock') THEN
    IF i.on_hand=0 THEN RAISE EXCEPTION 'Inventory: Add stock before making this product available' USING ERRCODE='P0001'; END IF;
    IF NEW.weight_lb IS NULL OR NEW.weight_lb<=0 OR NEW.preferred_vendor_id IS NULL THEN
      RAISE EXCEPTION 'Inventory: Set a shipping weight and fulfillment vendor before making this product available' USING ERRCODE='P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER inventory_guard_product_status BEFORE UPDATE OF stock_status,weight_lb,preferred_vendor_id ON public.products
FOR EACH ROW EXECUTE FUNCTION public.inventory_guard_product_status();

CREATE FUNCTION public.inventory_adjust(p_product_id uuid,p_action text,p_quantity integer,p_reason text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE i public.product_inventory%ROWTYPE; previous public.inventory_movements%ROWTYPE; p public.products%ROWTYPE;
BEGIN
  IF p_product_id IS NULL OR p_request_id IS NULL OR p_action IS NULL OR p_action NOT IN ('start','add','remove')
    OR p_quantity IS NULL OR p_quantity<0 OR (p_action<>'start' AND p_quantity=0)
    OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Inventory: Enter a valid stock quantity, action and reason' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 17));
  SELECT * INTO previous FROM public.inventory_movements WHERE request_id=p_request_id;
  IF FOUND AND (previous.product_id<>p_product_id OR previous.action<>p_action OR previous.quantity<>p_quantity OR previous.reason<>btrim(p_reason)) THEN
    RAISE EXCEPTION 'Inventory: Stock request ID already used for another adjustment' USING ERRCODE='23505';
  END IF;
  SELECT * INTO p FROM public.products WHERE id=p_product_id AND deleted_at IS NULL FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory: Product not found' USING ERRCODE='P0002'; END IF;
  IF previous.id IS NOT NULL THEN
    SELECT * INTO STRICT i FROM public.product_inventory WHERE product_id=p_product_id;
    RETURN to_jsonb(i)||jsonb_build_object('available',i.on_hand-i.reserved,'stock_status',p.stock_status);
  END IF;
  SELECT * INTO i FROM public.product_inventory WHERE product_id=p_product_id FOR NO KEY UPDATE;
  IF p_action='start' THEN
    IF FOUND THEN RAISE EXCEPTION 'Inventory: Stock tracking is already enabled; use Add stock or Remove stock' USING ERRCODE='P0001'; END IF;
    IF EXISTS(SELECT 1 FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id
      WHERE oi.product_id=p_product_id AND o.status::text IN ('pending','payment_held')
      AND NOT EXISTS(SELECT 1 FROM public.wallet_checkout_attempts wa WHERE wa.order_id=o.id AND wa.environment='sandbox')) THEN
      RAISE EXCEPTION 'Inventory: Resolve existing pending or payment-held orders before starting stock tracking' USING ERRCODE='P0001';
    END IF;
    INSERT INTO public.product_inventory(product_id,on_hand) VALUES(p_product_id,p_quantity) RETURNING * INTO i;
  ELSE
    IF NOT FOUND THEN RAISE EXCEPTION 'Inventory: Start stock tracking with an opening count first' USING ERRCODE='P0001'; END IF;
    IF p_action='remove' AND p_quantity>i.on_hand-i.reserved THEN
      RAISE EXCEPTION 'Inventory: Cannot remove stock reserved for pending orders' USING ERRCODE='P0001';
    END IF;
    UPDATE public.product_inventory SET on_hand=on_hand+CASE WHEN p_action='add' THEN p_quantity ELSE -p_quantity END,updated_at=now()
      WHERE product_id=p_product_id RETURNING * INTO i;
  END IF;
  INSERT INTO public.inventory_movements(product_id,request_id,action,quantity,on_hand_after,reserved_after,reason)
    VALUES(p_product_id,p_request_id,p_action,p_quantity,i.on_hand,i.reserved,btrim(p_reason));
  PERFORM public.inventory_sync_status(p_product_id,p_action IN ('start','add'));
  SELECT * INTO p FROM public.products WHERE id=p_product_id;
  RETURN to_jsonb(i)||jsonb_build_object('available',i.on_hand-i.reserved,'stock_status',p.stock_status);
END;
$$;

-- A statement trigger sees the complete cart and checks every line (including duplicate
-- SKUs) under product locks in a stable order. NO KEY UPDATE is compatible with foreign-key
-- KEY SHARE checks, avoiding lock-upgrade deadlocks between concurrent item inserts.
-- A failed item rolls back every allocation from that INSERT statement.
CREATE FUNCTION public.inventory_allocate_new_items()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE item record; p public.products%ROWTYPE; i public.product_inventory%ROWTYPE; state_to_save text;
BEGIN
  PERFORM 1 FROM public.orders o WHERE o.id IN (SELECT order_id FROM inventory_new_items) ORDER BY o.id FOR NO KEY UPDATE;
  PERFORM 1 FROM public.products locked_product WHERE locked_product.id IN (SELECT product_id FROM inventory_new_items) ORDER BY locked_product.id FOR NO KEY UPDATE;
  FOR item IN SELECT n.*,o.status::text AS order_status FROM inventory_new_items n JOIN public.orders o ON o.id=n.order_id ORDER BY n.product_id,n.id LOOP
    IF EXISTS(SELECT 1 FROM public.wallet_checkout_attempts wa WHERE wa.order_id=item.order_id AND wa.environment='sandbox') THEN CONTINUE; END IF;
    SELECT * INTO i FROM public.product_inventory WHERE product_id=item.product_id FOR NO KEY UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF item.order_status NOT IN ('pending','paid','payment_held') THEN
      RAISE EXCEPTION 'Inventory: Cannot add tracked stock to a closed order' USING ERRCODE='P0001';
    END IF;
    SELECT * INTO STRICT p FROM public.products WHERE id=item.product_id;
    IF NOT p.is_active OR p.deleted_at IS NOT NULL OR p.stock_status NOT IN ('in_stock','low_stock') THEN
      RAISE EXCEPTION 'Inventory: Inventory unavailable for SKU %',p.sku USING ERRCODE='P0001';
    END IF;
    IF p.weight_lb IS NULL OR p.weight_lb<=0 OR p.preferred_vendor_id IS NULL THEN
      RAISE EXCEPTION 'Inventory: Inventory fulfillment is not configured for SKU %',p.sku USING ERRCODE='P0001';
    END IF;
    IF item.quantity>i.on_hand-i.reserved THEN
      RAISE EXCEPTION 'Inventory: Insufficient inventory for SKU %; % available',p.sku,i.on_hand-i.reserved USING ERRCODE='P0001';
    END IF;
    state_to_save := CASE WHEN item.order_status='pending' THEN 'reserved' ELSE 'committed' END;
    UPDATE public.product_inventory SET
      reserved=reserved+CASE WHEN state_to_save='reserved' THEN item.quantity ELSE 0 END,
      on_hand=on_hand-CASE WHEN state_to_save='committed' THEN item.quantity ELSE 0 END,updated_at=now()
      WHERE product_id=item.product_id RETURNING * INTO i;
    INSERT INTO public.inventory_order_allocations(order_item_id,order_id,product_id,quantity,state)
      VALUES(item.id,item.order_id,item.product_id,item.quantity,state_to_save);
    INSERT INTO public.inventory_movements(product_id,order_id,order_item_id,action,quantity,on_hand_after,reserved_after,reason)
      VALUES(item.product_id,item.order_id,item.id,CASE WHEN state_to_save='reserved' THEN 'reserve' ELSE 'commit' END,item.quantity,i.on_hand,i.reserved,
        CASE WHEN state_to_save='reserved' THEN 'Stock reserved for pending order' ELSE 'Stock deducted for paid or payment-held order' END);
    PERFORM public.inventory_sync_status(item.product_id);
  END LOOP;
  RETURN NULL;
END;
$$;
CREATE TRIGGER inventory_allocate_new_items AFTER INSERT ON public.order_items
REFERENCING NEW TABLE AS inventory_new_items FOR EACH STATEMENT EXECUTE FUNCTION public.inventory_allocate_new_items();

CREATE FUNCTION public.inventory_order_status_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE a public.inventory_order_allocations%ROWTYPE; i public.product_inventory%ROWTYPE; movement text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status::text='pending' AND EXISTS(SELECT 1 FROM public.inventory_order_allocations WHERE order_id=NEW.id AND state<>'reserved') THEN
    RAISE EXCEPTION 'Inventory: Cannot reopen an order whose inventory was committed or released' USING ERRCODE='P0001';
  END IF;
  IF NEW.status::text IN ('paid','payment_held') AND EXISTS(SELECT 1 FROM public.inventory_order_allocations WHERE order_id=NEW.id AND state='released') THEN
    RAISE EXCEPTION 'Inventory: Order inventory was released; resolve the payment before fulfilling' USING ERRCODE='P0001';
  END IF;
  IF NEW.status::text NOT IN ('paid','payment_held','cancelled') THEN
    IF EXISTS(SELECT 1 FROM public.inventory_order_allocations WHERE order_id=NEW.id AND state='reserved') THEN
      RAISE EXCEPTION 'Inventory: Cancel the pending order to release its inventory' USING ERRCODE='P0001';
    END IF;
    RETURN NEW;
  END IF;
  PERFORM 1 FROM public.products p WHERE p.id IN (SELECT product_id FROM public.inventory_order_allocations WHERE order_id=NEW.id AND state='reserved') ORDER BY p.id FOR NO KEY UPDATE;
  FOR a IN SELECT * FROM public.inventory_order_allocations WHERE order_id=NEW.id AND state='reserved' ORDER BY product_id,order_item_id FOR NO KEY UPDATE LOOP
    movement := CASE WHEN NEW.status::text='cancelled' THEN 'release' ELSE 'commit' END;
    UPDATE public.product_inventory SET reserved=reserved-a.quantity,
      on_hand=on_hand-CASE WHEN movement='commit' THEN a.quantity ELSE 0 END,updated_at=now()
      WHERE product_id=a.product_id RETURNING * INTO i;
    UPDATE public.inventory_order_allocations SET state=CASE WHEN movement='commit' THEN 'committed' ELSE 'released' END,updated_at=now() WHERE order_item_id=a.order_item_id;
    INSERT INTO public.inventory_movements(product_id,order_id,order_item_id,action,quantity,on_hand_after,reserved_after,reason)
      VALUES(a.product_id,a.order_id,a.order_item_id,movement,a.quantity,i.on_hand,i.reserved,
        CASE WHEN movement='commit' THEN 'Payment confirmed; reserved stock deducted' ELSE 'Pending order cancelled; reserved stock released' END);
    PERFORM public.inventory_sync_status(a.product_id);
  END LOOP;
  -- Committed stock is never automatically returned: cancellations may concern held payments,
  -- shipments or returns. An administrator must confirm physical stock and use Add stock.
  RETURN NEW;
END;
$$;
CREATE TRIGGER inventory_order_status_changed AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.inventory_order_status_changed();

CREATE FUNCTION public.inventory_guard_item_change()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE a public.inventory_order_allocations%ROWTYPE;
BEGIN
  -- Serialize deletes/identity edits with payment and cancellation transitions.
  PERFORM 1 FROM public.orders WHERE id=OLD.order_id FOR NO KEY UPDATE;
  SELECT * INTO a FROM public.inventory_order_allocations WHERE order_item_id=OLD.id;
  IF FOUND THEN
    IF TG_OP='DELETE' AND a.state='committed' THEN
      RAISE EXCEPTION 'Inventory: Cannot delete an item with committed inventory; preserve the order and record any returned stock separately' USING ERRCODE='P0001';
    ELSIF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.order_id IS DISTINCT FROM OLD.order_id
      OR NEW.product_id IS DISTINCT FROM OLD.product_id OR NEW.quantity IS DISTINCT FROM OLD.quantity) THEN
      RAISE EXCEPTION 'Inventory: Cannot change the product, quantity or order of an allocated inventory item' USING ERRCODE='P0001';
    END IF;
  END IF;
  IF TG_OP='UPDATE' AND (NEW.product_id IS DISTINCT FROM OLD.product_id OR NEW.quantity IS DISTINCT FROM OLD.quantity OR NEW.order_id IS DISTINCT FROM OLD.order_id)
    AND EXISTS(SELECT 1 FROM public.product_inventory WHERE product_id IN (OLD.product_id,NEW.product_id)) THEN
    RAISE EXCEPTION 'Inventory: Create a new order item instead of changing a tracked product or quantity' USING ERRCODE='P0001';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER inventory_guard_item_change BEFORE UPDATE OR DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.inventory_guard_item_change();

CREATE FUNCTION public.inventory_release_deleted_items()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE a public.inventory_order_allocations%ROWTYPE; i public.product_inventory%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.products p WHERE p.id IN (
    SELECT product_id FROM public.inventory_order_allocations WHERE order_item_id IN (SELECT id FROM inventory_old_items) AND state='reserved'
  ) ORDER BY p.id FOR NO KEY UPDATE;
  FOR a IN SELECT * FROM public.inventory_order_allocations WHERE order_item_id IN (SELECT id FROM inventory_old_items) AND state='reserved'
    ORDER BY product_id,order_item_id FOR NO KEY UPDATE LOOP
    UPDATE public.product_inventory SET reserved=reserved-a.quantity,updated_at=now() WHERE product_id=a.product_id RETURNING * INTO i;
    UPDATE public.inventory_order_allocations SET state='released',updated_at=now() WHERE order_item_id=a.order_item_id;
    INSERT INTO public.inventory_movements(product_id,order_id,order_item_id,action,quantity,on_hand_after,reserved_after,reason)
      VALUES(a.product_id,a.order_id,a.order_item_id,'release',a.quantity,i.on_hand,i.reserved,'Pending order or item deleted; reserved stock released');
    PERFORM public.inventory_sync_status(a.product_id);
  END LOOP;
  RETURN NULL;
END;
$$;
CREATE TRIGGER inventory_release_deleted_items AFTER DELETE ON public.order_items
REFERENCING OLD TABLE AS inventory_old_items FOR EACH STATEMENT EXECUTE FUNCTION public.inventory_release_deleted_items();

-- Record the wallet environment before inserting line items. The whole function remains
-- atomic, but inventory can now distinguish sandbox attempts from customer purchases.
CREATE OR REPLACE FUNCTION public.prepare_wallet_checkout(
  p_id uuid,p_fingerprint text,p_method text,p_environment text,p_order jsonb,p_items jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE a public.wallet_checkout_attempts%ROWTYPE; o public.orders%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  SELECT * INTO a FROM public.wallet_checkout_attempts WHERE id=p_id;
  IF FOUND THEN
    IF a.fingerprint<>p_fingerprint OR a.method<>p_method OR a.environment<>p_environment THEN RAISE EXCEPTION 'checkout request conflict'; END IF;
    RETURN to_jsonb(a);
  END IF;
  IF jsonb_array_length(p_items)<1 OR jsonb_array_length(p_items)>100 THEN RAISE EXCEPTION 'invalid line items'; END IF;
  IF (p_order->>'total')::numeric<>(p_order->>'subtotal')::numeric+(p_order->>'shipping_cost')::numeric+(p_order->>'tax')::numeric
    OR (p_order->>'subtotal')::numeric<>(SELECT sum((i->>'line_subtotal')::numeric) FROM jsonb_array_elements(p_items) i) THEN RAISE EXCEPTION 'total mismatch'; END IF;
  INSERT INTO public.orders(customer_email,status,subtotal,shipping_cost,tax,total,shipping_address,billing_address,business_name,is_business,client_ip)
    VALUES(p_order->>'customer_email','pending',(p_order->>'subtotal')::numeric,(p_order->>'shipping_cost')::numeric,
      (p_order->>'tax')::numeric,(p_order->>'total')::numeric,p_order->'shipping_address',p_order->'billing_address',
      p_order->>'business_name',(p_order->>'is_business')::boolean,p_order->>'client_ip') RETURNING * INTO o;
  INSERT INTO public.wallet_checkout_attempts(id,order_id,order_number,fingerprint,method,environment,total)
    VALUES(p_id,o.id,o.order_number,p_fingerprint,p_method,p_environment,o.total) RETURNING * INTO a;
  INSERT INTO public.order_items(order_id,product_id,product_sku,product_name,quantity,unit_price,unit_wholesale_cost,line_subtotal,assigned_vendor_id)
    SELECT o.id,(i->>'product_id')::uuid,i->>'product_sku',i->>'product_name',(i->>'quantity')::int,
      (i->>'unit_price')::numeric,(i->>'unit_wholesale_cost')::numeric,(i->>'line_subtotal')::numeric,
      (i->>'assigned_vendor_id')::uuid FROM jsonb_array_elements(p_items) i;
  RETURN to_jsonb(a);
END;
$$;
REVOKE ALL ON FUNCTION public.prepare_wallet_checkout(uuid,text,text,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_wallet_checkout(uuid,text,text,text,jsonb,jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.inventory_adjust(uuid,text,integer,text,uuid), public.inventory_sync_status(uuid,boolean),
  public.inventory_guard_product_status(), public.inventory_allocate_new_items(), public.inventory_order_status_changed(),
  public.inventory_guard_item_change(), public.inventory_release_deleted_items() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_adjust(uuid,text,integer,text,uuid), public.inventory_sync_status(uuid,boolean),
  public.inventory_guard_product_status(), public.inventory_allocate_new_items(), public.inventory_order_status_changed(),
  public.inventory_guard_item_change(), public.inventory_release_deleted_items() TO service_role;

COMMENT ON TABLE public.product_inventory IS 'Opt-in counts per purchasable SKU. One four-bag case counts as one unit. Opening stock excludes items already committed to paid orders.';
COMMENT ON TABLE public.inventory_order_allocations IS 'Pending orders reserve stock; paid/payment-held orders consume it exactly once. No unverified timeout expiry.';
COMMENT ON TABLE public.inventory_movements IS 'Append-only stock history. Refunds or cancelled paid/held orders require explicit physical restocking.';
COMMIT;
