-- 0002_rls_policies.sql
-- La Costa Gourmet — row-level security
--
-- Default deny: RLS is enabled on every table. Each table gets explicit
-- policies for the `anon` and `authenticated` roles where public or
-- customer-facing access is required. The `service_role` JWT bypasses RLS
-- by design — all admin/server-side operations go through it.
--
-- Apply AFTER 0001_initial_schema.sql.

BEGIN;

-- =============================================================================
-- Enable RLS on every table
-- =============================================================================

ALTER TABLE vendors                ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories             ENABLE ROW LEVEL SECURITY;
ALTER TABLE products               ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images         ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses              ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_payment_methods  ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements            ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds                ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings               ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log              ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_events  ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Public catalog reads
-- =============================================================================

CREATE POLICY products_public_read ON products
  FOR SELECT TO anon, authenticated
  USING (is_active = true AND deleted_at IS NULL);

CREATE POLICY brands_public_read ON brands
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

CREATE POLICY categories_public_read ON categories
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

CREATE POLICY vendors_public_read ON vendors
  FOR SELECT TO anon, authenticated
  USING (is_active = true AND deleted_at IS NULL);

-- product_images and product_categories are trivially public so product pages render.
CREATE POLICY product_images_public_read ON product_images
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY product_categories_public_read ON product_categories
  FOR SELECT TO anon, authenticated
  USING (true);

-- =============================================================================
-- customers — own-row access only
--
-- The INSERT policy allows both `anon` and `authenticated`, but the
-- WITH CHECK (id = auth.uid()) clause means raw anonymous requests (where
-- auth.uid() is NULL) always fail. Effective path: a user who has just
-- completed supabase.auth.signUp() is already `authenticated` by the time
-- they insert their own profile row, so this policy lets that flow work.
--
-- Pure admin signups / bulk imports go through a server-side API route
-- that uses the service role and bypasses RLS entirely.
-- =============================================================================

CREATE POLICY customers_select_own ON customers
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY customers_update_own ON customers
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY customers_insert_self ON customers
  FOR INSERT TO anon, authenticated
  WITH CHECK (id = auth.uid());

-- =============================================================================
-- addresses — full CRUD on own rows
-- =============================================================================

CREATE POLICY addresses_select_own ON addresses
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

CREATE POLICY addresses_insert_own ON addresses
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid());

CREATE POLICY addresses_update_own ON addresses
  FOR UPDATE TO authenticated
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());

CREATE POLICY addresses_delete_own ON addresses
  FOR DELETE TO authenticated
  USING (customer_id = auth.uid());

-- =============================================================================
-- saved_payment_methods — full CRUD on own rows
-- =============================================================================

CREATE POLICY spm_select_own ON saved_payment_methods
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

CREATE POLICY spm_insert_own ON saved_payment_methods
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid());

CREATE POLICY spm_update_own ON saved_payment_methods
  FOR UPDATE TO authenticated
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());

CREATE POLICY spm_delete_own ON saved_payment_methods
  FOR DELETE TO authenticated
  USING (customer_id = auth.uid());

-- =============================================================================
-- carts + cart_items — authenticated users manage their own cart.
-- Guest carts (customer_id IS NULL + session_id) are handled by server-side
-- API routes using the service role; not exposed via RLS.
-- =============================================================================

CREATE POLICY carts_select_own ON carts
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

CREATE POLICY carts_insert_own ON carts
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid());

CREATE POLICY carts_update_own ON carts
  FOR UPDATE TO authenticated
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());

CREATE POLICY carts_delete_own ON carts
  FOR DELETE TO authenticated
  USING (customer_id = auth.uid());

CREATE POLICY cart_items_select_own ON cart_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM carts
    WHERE carts.id = cart_items.cart_id
      AND carts.customer_id = auth.uid()
  ));

CREATE POLICY cart_items_insert_own ON cart_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM carts
    WHERE carts.id = cart_items.cart_id
      AND carts.customer_id = auth.uid()
  ));

CREATE POLICY cart_items_update_own ON cart_items
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM carts
    WHERE carts.id = cart_items.cart_id
      AND carts.customer_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM carts
    WHERE carts.id = cart_items.cart_id
      AND carts.customer_id = auth.uid()
  ));

CREATE POLICY cart_items_delete_own ON cart_items
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM carts
    WHERE carts.id = cart_items.cart_id
      AND carts.customer_id = auth.uid()
  ));

-- =============================================================================
-- orders — customers see their own, guest checkout may INSERT.
--
-- Note: in practice the checkout API route uses the service role to create
-- orders + order_items + payments atomically. These policies allow the
-- client-side path as a fallback; server-side is the real validator.
-- =============================================================================

CREATE POLICY orders_select_own ON orders
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

CREATE POLICY orders_insert_guest ON orders
  FOR INSERT TO anon
  WITH CHECK (customer_id IS NULL);

CREATE POLICY orders_insert_self ON orders
  FOR INSERT TO authenticated
  WITH CHECK (customer_id IS NULL OR customer_id = auth.uid());

-- order_items: read tied to order ownership. Insert is permissive — the
-- server-side checkout route is the real arbiter.
CREATE POLICY order_items_select_own ON order_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = order_items.order_id
      AND orders.customer_id = auth.uid()
  ));

CREATE POLICY order_items_insert ON order_items
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- payments: read-only for the owning customer.
CREATE POLICY payments_select_own ON payments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = payments.order_id
      AND orders.customer_id = auth.uid()
  ));

-- vendor_orders: read-only for the owning customer (so /account/orders/[id]
-- can show which supplier is fulfilling what).
CREATE POLICY vendor_orders_select_own ON vendor_orders
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = vendor_orders.order_id
      AND orders.customer_id = auth.uid()
  ));

-- =============================================================================
-- newsletter_subscribers — public signup from footer / checkout / popup.
-- Rate-limiting and email validation happen in the app layer.
-- =============================================================================

CREATE POLICY newsletter_signup_insert ON newsletter_subscribers
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- =============================================================================
-- Admin-only tables — no anon / authenticated policies at all.
-- Service role bypasses RLS; everything else is denied.
--   settings, audit_log, settlements, disputes, refunds, recommendation_events
-- =============================================================================

COMMIT;
