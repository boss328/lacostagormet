BEGIN;

ALTER TABLE public.payments ADD COLUMN provider text NOT NULL DEFAULT 'authnet';
ALTER TABLE public.payments ADD COLUMN provider_transaction_id text;
CREATE UNIQUE INDEX payments_provider_transaction_unique ON public.payments(provider, provider_transaction_id);

CREATE TABLE public.wallet_checkout_attempts (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id),
  order_number text NOT NULL,
  fingerprint text NOT NULL,
  method text NOT NULL CHECK (method IN ('paypal', 'apple_pay', 'amazon_pay')),
  environment text NOT NULL CHECK (environment IN ('sandbox', 'live')),
  total numeric(10,2) NOT NULL CHECK (total > 0),
  provider_order_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  UNIQUE (method, environment, provider_order_id)
);
ALTER TABLE public.wallet_checkout_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wallet_checkout_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.wallet_checkout_attempts TO service_role;
CREATE INDEX wallet_pending_idx ON public.wallet_checkout_attempts(created_at) WHERE status = 'pending';

-- Only the server's service role can call these SECURITY INVOKER functions.
-- Row creation + line items are atomic, and request IDs serialize concurrent retries.
CREATE FUNCTION public.prepare_wallet_checkout(
  p_id uuid, p_fingerprint text, p_method text, p_environment text, p_order jsonb, p_items jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  a public.wallet_checkout_attempts%ROWTYPE;
  o public.orders%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  SELECT * INTO a FROM public.wallet_checkout_attempts WHERE id = p_id;
  IF FOUND THEN
    IF a.fingerprint <> p_fingerprint OR a.method <> p_method OR a.environment <> p_environment THEN
      RAISE EXCEPTION 'checkout request conflict';
    END IF;
    RETURN to_jsonb(a);
  END IF;
  IF jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 100 THEN
    RAISE EXCEPTION 'invalid line items';
  END IF;
  IF (p_order->>'total')::numeric <> (p_order->>'subtotal')::numeric + (p_order->>'shipping_cost')::numeric + (p_order->>'tax')::numeric
    OR (p_order->>'subtotal')::numeric <> (SELECT sum((i->>'line_subtotal')::numeric) FROM jsonb_array_elements(p_items) i) THEN
    RAISE EXCEPTION 'total mismatch';
  END IF;
  INSERT INTO public.orders(customer_email, status, subtotal, shipping_cost, tax, total,
    shipping_address, billing_address, business_name, is_business, client_ip)
  VALUES (p_order->>'customer_email', 'pending', (p_order->>'subtotal')::numeric,
    (p_order->>'shipping_cost')::numeric, (p_order->>'tax')::numeric, (p_order->>'total')::numeric,
    p_order->'shipping_address', p_order->'billing_address', p_order->>'business_name',
    (p_order->>'is_business')::boolean, p_order->>'client_ip') RETURNING * INTO o;
  INSERT INTO public.order_items(order_id, product_id, product_sku, product_name, quantity, unit_price,
    unit_wholesale_cost, line_subtotal, assigned_vendor_id)
  SELECT o.id, (i->>'product_id')::uuid, i->>'product_sku', i->>'product_name', (i->>'quantity')::int,
    (i->>'unit_price')::numeric, (i->>'unit_wholesale_cost')::numeric, (i->>'line_subtotal')::numeric,
    (i->>'assigned_vendor_id')::uuid FROM jsonb_array_elements(p_items) i;
  INSERT INTO public.wallet_checkout_attempts(id, order_id, order_number, fingerprint, method, environment, total)
  VALUES(p_id, o.id, o.order_number, p_fingerprint, p_method, p_environment, o.total) RETURNING * INTO a;
  RETURN to_jsonb(a);
END;
$$;

-- Payment ledger, audit record, attempt and order status commit together.
CREATE FUNCTION public.finalize_wallet_checkout(p_attempt_id uuid, p_transaction_id text, p_amount numeric, p_currency text)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  a public.wallet_checkout_attempts%ROWTYPE;
  o public.orders%ROWTYPE;
  payment_provider text;
BEGIN
  SELECT * INTO STRICT a FROM public.wallet_checkout_attempts WHERE id = p_attempt_id FOR UPDATE;
  SELECT * INTO STRICT o FROM public.orders WHERE id = a.order_id FOR UPDATE;
  IF p_currency IS DISTINCT FROM 'USD' OR p_amount IS DISTINCT FROM a.total OR p_amount IS DISTINCT FROM o.total OR p_transaction_id IS NULL OR length(p_transaction_id) < 3 THEN
    RAISE EXCEPTION 'payment mismatch';
  END IF;
  payment_provider := CASE WHEN a.method = 'amazon_pay' THEN 'amazon_pay' ELSE 'paypal' END;
  IF a.status = 'paid' THEN
    IF NOT EXISTS (SELECT 1 FROM public.payments WHERE order_id = a.order_id AND provider = payment_provider AND provider_transaction_id = p_transaction_id) THEN
      RAISE EXCEPTION 'transaction mismatch';
    END IF;
    RETURN 'already_final';
  END IF;
  IF o.status <> 'pending' OR a.provider_order_id IS NULL THEN RAISE EXCEPTION 'order is not payable'; END IF;
  INSERT INTO public.payments(order_id, type, amount, status, provider, provider_transaction_id, card_brand)
  VALUES(a.order_id, 'auth_capture', p_amount, 'succeeded', payment_provider, p_transaction_id, a.method);
  UPDATE public.orders SET status = 'paid' WHERE id = a.order_id;
  UPDATE public.wallet_checkout_attempts SET status = 'paid' WHERE id = a.id;
  INSERT INTO public.payment_audit_log(order_id, event_type, transaction_id, amount_cents, source)
  VALUES(a.order_id, 'wallet_payment_confirmed', p_transaction_id, (p_amount * 100)::int, a.method);
  RETURN 'finalized';
END;
$$;
REVOKE ALL ON FUNCTION public.prepare_wallet_checkout(uuid,text,text,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_wallet_checkout(uuid,text,numeric,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_wallet_checkout(uuid,text,text,text,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_wallet_checkout(uuid,text,numeric,text) TO service_role;
COMMIT;
