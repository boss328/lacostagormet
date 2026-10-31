BEGIN;

CREATE TABLE public.manual_order_payment_sessions (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id),
  claim_id uuid NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  provider_environment text NOT NULL CHECK (provider_environment IN ('production', 'sandbox')),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  issued_at timestamptz,
  form_token text,
  closed_at timestamptz,
  CHECK (form_token IS NULL OR issued_at IS NOT NULL)
);
ALTER TABLE public.manual_order_payment_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manual_order_payment_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.manual_order_payment_sessions TO service_role;

-- Claim, publish and cancellation always lock the order first. The network
-- call runs between transactions, and the browser only receives a saved token.
CREATE FUNCTION public.claim_manual_hosted_payment(
  p_order_id uuid, p_amount_cents bigint, p_environment text, p_claim_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  o public.orders%ROWTYPE;
  s public.manual_order_payment_sessions%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.source <> 'manual' OR o.status <> 'pending'
     OR p_amount_cents IS NULL OR p_amount_cents <= 0 OR o.total * 100 <> p_amount_cents
     OR p_claim_id IS NULL OR p_environment IS NULL OR p_environment NOT IN ('sandbox', 'production')
     OR NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = p_order_id)
     OR EXISTS (SELECT 1 FROM public.payments WHERE order_id = p_order_id
                AND status IN ('pending','succeeded','held_for_review')) THEN
    RETURN jsonb_build_object('state','unavailable');
  END IF;

  SELECT * INTO s FROM public.manual_order_payment_sessions WHERE order_id = o.id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.manual_order_payment_sessions(order_id,claim_id,amount_cents,provider_environment)
      VALUES(o.id,p_claim_id,p_amount_cents,p_environment);
  ELSIF s.closed_at IS NOT NULL OR s.amount_cents <> p_amount_cents OR s.provider_environment <> p_environment THEN
    RETURN jsonb_build_object('state','unavailable');
  ELSIF s.issued_at IS NOT NULL THEN
    -- Expiration only prevents opening the form. Someone may already have
    -- opened it and paid, so do not mint another token on this order.
    IF s.form_token IS NOT NULL AND s.started_at + interval '14 minutes' > clock_timestamp() THEN
      RETURN jsonb_build_object('state','ready','formToken',s.form_token);
    END IF;
    RETURN jsonb_build_object('state','review');
  ELSIF s.started_at + interval '60 seconds' > clock_timestamp() THEN
    RETURN jsonb_build_object('state','busy');
  ELSE
    UPDATE public.manual_order_payment_sessions
       SET claim_id = p_claim_id, started_at = clock_timestamp() WHERE order_id = o.id;
  END IF;

  RETURN jsonb_build_object('state','claimed','orderNumber',o.order_number,'total',o.total,
    'customerEmail',o.customer_email,'billingAddress',o.billing_address,'shippingAddress',o.shipping_address);
END;
$$;

CREATE FUNCTION public.publish_manual_hosted_payment(
  p_order_id uuid, p_claim_id uuid, p_form_token text
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  o public.orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.source <> 'manual' OR o.status <> 'pending'
     OR p_form_token IS NULL OR length(p_form_token) NOT BETWEEN 1 AND 32768
     OR EXISTS (SELECT 1 FROM public.payments WHERE order_id = p_order_id
                AND status IN ('pending','succeeded','held_for_review')) THEN RETURN false; END IF;
  UPDATE public.manual_order_payment_sessions
    SET issued_at = clock_timestamp(), form_token = p_form_token
    WHERE order_id = o.id AND claim_id = p_claim_id AND amount_cents = o.total * 100
      AND issued_at IS NULL AND closed_at IS NULL AND started_at + interval '14 minutes' > clock_timestamp();
  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.guard_manual_hosted_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF OLD.source = 'manual' AND OLD.status IN ('pending','payment_held')
     AND ((NEW.status = 'cancelled' AND OLD.status <> NEW.status)
          OR NEW.total IS DISTINCT FROM OLD.total OR OLD.source IS DISTINCT FROM NEW.source)
     AND EXISTS (SELECT 1 FROM public.manual_order_payment_sessions
                 WHERE order_id = OLD.id AND closed_at IS NULL) THEN
    RAISE EXCEPTION 'Check the hosted payment before changing this order.' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_manual_hosted_payment BEFORE UPDATE OF status,total,source ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_manual_hosted_payment();

CREATE FUNCTION public.cancel_manual_payment_order(
  p_order_id uuid, p_expected_status text, p_payment_closed boolean, p_note text
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  o public.orders%ROWTYPE;
  s public.manual_order_payment_sessions%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.source <> 'manual' OR o.status NOT IN ('pending','payment_held')
     OR o.status::text IS DISTINCT FROM p_expected_status THEN RETURN false; END IF;
  SELECT * INTO s FROM public.manual_order_payment_sessions WHERE order_id = o.id FOR UPDATE;
  IF FOUND THEN
    IF o.status = 'pending' AND EXISTS (SELECT 1 FROM public.payments WHERE order_id = o.id
        AND status IN ('pending','succeeded','held_for_review')) THEN
      RAISE EXCEPTION 'A payment is recorded on this pending order. Reconcile its payment status before cancelling.' USING ERRCODE='P0001';
    END IF;
    IF s.issued_at IS NOT NULL AND s.issued_at + interval '15 minutes' > clock_timestamp() THEN
      RAISE EXCEPTION 'The card payment page can still be opened. Wait 15 minutes after issuance, then check the payment in Authorize.net.' USING ERRCODE='P0001';
    END IF;
    IF s.issued_at IS NOT NULL AND p_payment_closed IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Confirm in Authorize.net that payment is closed before cancelling this order.' USING ERRCODE='P0001';
    END IF;
    UPDATE public.manual_order_payment_sessions SET closed_at=clock_timestamp(),form_token=NULL WHERE order_id=o.id;
  END IF;
  UPDATE public.orders SET status='cancelled',
    admin_notes=concat_ws(E'\n',nullif(o.admin_notes,''),nullif(left(p_note,1000),''))
    WHERE id=o.id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_manual_hosted_payment(uuid,bigint,text,uuid),
  public.publish_manual_hosted_payment(uuid,uuid,text),public.guard_manual_hosted_payment(),
  public.cancel_manual_payment_order(uuid,text,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_manual_hosted_payment(uuid,bigint,text,uuid),
  public.publish_manual_hosted_payment(uuid,uuid,text),public.guard_manual_hosted_payment(),
  public.cancel_manual_payment_order(uuid,text,boolean,text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
