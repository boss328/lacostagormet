-- 0001_initial_schema.sql
-- La Costa Gourmet — initial schema
-- Generated from lcg-spec/03-data-model/3.1-schema.md
--
-- Apply by pasting into the Supabase SQL Editor. One transaction; rolls back on error.

BEGIN;

-- =============================================================================
-- Extensions
-- =============================================================================
-- pgcrypto is enabled by default on Supabase; it provides gen_random_uuid().
CREATE EXTENSION IF NOT EXISTS citext;

-- =============================================================================
-- Enums
-- =============================================================================

CREATE TYPE order_status AS ENUM (
  'pending',
  'payment_held',
  'paid',
  'cancelled',
  'refunded',
  'partially_refunded'
);

CREATE TYPE fulfillment_status AS ENUM (
  'unfulfilled',
  'partially_sent',
  'fully_sent',
  'partially_shipped',
  'shipped',
  'delivered'
);

CREATE TYPE order_source AS ENUM (
  'website',
  'amazon',
  'manual',
  'migrated'
);

CREATE TYPE vendor_order_status AS ENUM (
  'pending',
  'sent',
  'confirmed',
  'shipped',
  'delivered',
  'cancelled'
);

CREATE TYPE payment_type AS ENUM (
  'auth',
  'capture',
  'auth_capture',
  'void',
  'refund'
);

CREATE TYPE payment_status AS ENUM (
  'pending',
  'succeeded',
  'held_for_review',
  'failed',
  'voided',
  'refunded'
);

-- =============================================================================
-- Shared: updated_at trigger function
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =============================================================================
-- Order number sequence — human-readable, monotonic.
-- Default on orders.order_number produces LCG-10001, LCG-10002, ...
-- =============================================================================

CREATE SEQUENCE order_number_seq START WITH 10001;

-- =============================================================================
-- Tables (in dependency order)
-- =============================================================================

-- vendors ---------------------------------------------------------------------
CREATE TABLE vendors (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  slug              text UNIQUE NOT NULL,
  is_self_fulfilled boolean NOT NULL DEFAULT false,
  contact_email     text,
  contact_name      text,
  phone             text,
  email_template    text,
  notes             text,
  display_order     int NOT NULL DEFAULT 0,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE TRIGGER set_updated_at_vendors BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- brands ----------------------------------------------------------------------
CREATE TABLE brands (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL UNIQUE,
  slug              text UNIQUE NOT NULL,
  description       text,
  logo_url          text,
  primary_vendor_id uuid REFERENCES vendors(id),
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at_brands BEFORE UPDATE ON brands
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- categories ------------------------------------------------------------------
CREATE TABLE categories (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  slug             text UNIQUE NOT NULL,
  parent_id        uuid REFERENCES categories(id),
  description      text,
  image_url        text,
  meta_title       text,
  meta_description text,
  display_order    int NOT NULL DEFAULT 0,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at_categories BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- products --------------------------------------------------------------------
CREATE TABLE products (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku                 text UNIQUE NOT NULL,
  name                text NOT NULL,
  slug                text UNIQUE NOT NULL,
  brand_id            uuid REFERENCES brands(id),
  primary_category_id uuid REFERENCES categories(id),
  description         text,
  short_description   text,
  ingredients         text,
  weight_lb           numeric(6,2),
  dimensions          jsonb,
  pack_size           text,
  units_per_pack      int,
  retail_price        numeric(10,2) NOT NULL,
  wholesale_cost      numeric(10,2),
  preferred_vendor_id uuid REFERENCES vendors(id),
  meta_title          text,
  meta_description    text,
  tax_class           text,
  is_active           boolean NOT NULL DEFAULT true,
  is_featured         boolean NOT NULL DEFAULT false,
  stock_status        text NOT NULL DEFAULT 'in_stock',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
CREATE TRIGGER set_updated_at_products BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX products_brand_id_idx ON products(brand_id);
CREATE INDEX products_is_active_idx ON products(is_active) WHERE is_active;

-- product_images --------------------------------------------------------------
CREATE TABLE product_images (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url           text NOT NULL,
  alt_text      text,
  display_order int NOT NULL DEFAULT 0,
  is_primary    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- product_categories (M2M) ----------------------------------------------------
CREATE TABLE product_categories (
  product_id  uuid NOT NULL REFERENCES products(id)   ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);

-- customers -------------------------------------------------------------------
CREATE TABLE customers (
  id                    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 citext NOT NULL UNIQUE,
  first_name            text,
  last_name             text,
  phone                 text,
  is_business           boolean NOT NULL DEFAULT false,
  company_name          text,
  tax_id                text,
  marketing_opt_in      boolean NOT NULL DEFAULT false,
  legacy_bc_customer_id text,
  migrated_from_bc      boolean NOT NULL DEFAULT false,
  needs_password_reset  boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);
CREATE TRIGGER set_updated_at_customers BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- addresses -------------------------------------------------------------------
CREATE TABLE addresses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label               text,
  is_default_shipping boolean NOT NULL DEFAULT false,
  is_default_billing  boolean NOT NULL DEFAULT false,
  first_name          text NOT NULL,
  last_name           text NOT NULL,
  company             text,
  street1             text NOT NULL,
  street2             text,
  city                text NOT NULL,
  state               text NOT NULL,
  postal_code         text NOT NULL,
  country             text NOT NULL DEFAULT 'US',
  phone               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at_addresses BEFORE UPDATE ON addresses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX addresses_customer_id_idx ON addresses(customer_id);

-- saved_payment_methods -------------------------------------------------------
CREATE TABLE saved_payment_methods (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id                uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  authnet_profile_id         text NOT NULL,
  authnet_payment_profile_id text NOT NULL,
  card_last_four             text NOT NULL,
  card_brand                 text,
  expiry_month               int,
  expiry_year                int,
  billing_address_id         uuid REFERENCES addresses(id),
  is_default                 boolean NOT NULL DEFAULT false,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  deleted_at                 timestamptz
);
CREATE TRIGGER set_updated_at_saved_payment_methods BEFORE UPDATE ON saved_payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX saved_payment_methods_customer_id_idx ON saved_payment_methods(customer_id);

-- carts -----------------------------------------------------------------------
CREATE TABLE carts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id),
  session_id  text,
  subtotal    numeric(10,2) NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at_carts BEFORE UPDATE ON carts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- cart_items ------------------------------------------------------------------
CREATE TABLE cart_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id    uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  quantity   int NOT NULL CHECK (quantity > 0),
  unit_price numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, product_id)
);
CREATE TRIGGER set_updated_at_cart_items BEFORE UPDATE ON cart_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- orders ----------------------------------------------------------------------
CREATE TABLE orders (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number       text UNIQUE NOT NULL DEFAULT ('LCG-' || nextval('order_number_seq')::text),
  source             order_source NOT NULL DEFAULT 'website',
  source_order_id    text,
  customer_id        uuid REFERENCES customers(id),
  customer_email     text NOT NULL,
  status             order_status NOT NULL DEFAULT 'pending',
  fulfillment_status fulfillment_status NOT NULL DEFAULT 'unfulfilled',
  subtotal           numeric(10,2) NOT NULL,
  shipping_cost      numeric(10,2) NOT NULL DEFAULT 0,
  tax                numeric(10,2) NOT NULL DEFAULT 0,
  discount           numeric(10,2) NOT NULL DEFAULT 0,
  total              numeric(10,2) NOT NULL,
  shipping_address   jsonb NOT NULL,
  billing_address    jsonb NOT NULL,
  is_business        boolean NOT NULL DEFAULT false,
  business_name      text,
  business_tax_id    text,
  admin_notes        text,
  legacy_bc_order_id text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at_orders BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX orders_customer_id_idx ON orders(customer_id);
CREATE INDEX orders_status_idx      ON orders(status);
CREATE INDEX orders_created_at_idx  ON orders(created_at DESC);

-- order_items -----------------------------------------------------------------
CREATE TABLE order_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id          uuid REFERENCES products(id) ON DELETE SET NULL,
  product_sku         text NOT NULL,
  product_name        text NOT NULL,
  quantity            int NOT NULL CHECK (quantity > 0),
  unit_price          numeric(10,2) NOT NULL,
  unit_wholesale_cost numeric(10,2),
  line_subtotal       numeric(10,2) NOT NULL,
  assigned_vendor_id  uuid REFERENCES vendors(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_items_order_id_idx           ON order_items(order_id);
CREATE INDEX order_items_product_id_idx         ON order_items(product_id);
CREATE INDEX order_items_assigned_vendor_id_idx ON order_items(assigned_vendor_id);

-- vendor_orders ---------------------------------------------------------------
CREATE TABLE vendor_orders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  vendor_id             uuid REFERENCES vendors(id),
  status                vendor_order_status NOT NULL DEFAULT 'pending',
  email_sent_at         timestamptz,
  email_subject         text,
  email_body            text,
  email_message_id      text,
  purchase_order_number text,
  tracking_number       text,
  tracking_carrier      text,
  tracking_url          text,
  shipped_at            timestamptz,
  admin_notes           text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at_vendor_orders BEFORE UPDATE ON vendor_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX vendor_orders_order_id_idx  ON vendor_orders(order_id);
CREATE INDEX vendor_orders_vendor_id_idx ON vendor_orders(vendor_id);
CREATE INDEX vendor_orders_status_idx    ON vendor_orders(status);

-- payments --------------------------------------------------------------------
CREATE TABLE payments (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type                    payment_type NOT NULL,
  amount                  numeric(10,2) NOT NULL,
  status                  payment_status NOT NULL,
  authnet_transaction_id  text UNIQUE,
  authnet_response_code   text,
  authnet_response_reason text,
  authnet_avs_result      text,
  authnet_cvv_result      text,
  fraud_held              boolean NOT NULL DEFAULT false,
  fraud_reason            text,
  card_last_four          text,
  card_brand              text,
  raw_response            jsonb,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payments_order_id_idx ON payments(order_id);

-- settlements (Phase 2 stub) --------------------------------------------------
CREATE TABLE settlements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_date   date NOT NULL,
  authnet_batch_id  text UNIQUE,
  gross_amount      numeric(12,2),
  fees              numeric(10,2),
  net_amount        numeric(12,2),
  wf_deposit_id     text,
  transaction_count int,
  status            text NOT NULL DEFAULT 'pending',
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at_settlements BEFORE UPDATE ON settlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- disputes --------------------------------------------------------------------
CREATE TABLE disputes (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id               uuid REFERENCES orders(id),
  payment_id             uuid REFERENCES payments(id),
  authnet_transaction_id text,
  amount                 numeric(10,2) NOT NULL,
  reason_code            text,
  reason_description     text,
  status                 text NOT NULL,
  response_due_date      date,
  evidence_uploaded      boolean NOT NULL DEFAULT false,
  admin_notes            text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at_disputes BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- refunds ---------------------------------------------------------------------
CREATE TABLE refunds (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid REFERENCES orders(id),
  payment_id        uuid REFERENCES payments(id),
  amount            numeric(10,2) NOT NULL,
  reason            text,
  initiated_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_notified boolean NOT NULL DEFAULT false,
  status            text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at_refunds BEFORE UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- settings --------------------------------------------------------------------
CREATE TABLE settings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text UNIQUE NOT NULL,
  value       jsonb NOT NULL,
  description text,
  category    text,
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at_settings BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- audit_log -------------------------------------------------------------------
CREATE TABLE audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type  text,
  entity_type text NOT NULL,
  entity_id   uuid,
  action      text NOT NULL,
  metadata    jsonb,
  ip_address  inet,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- newsletter_subscribers ------------------------------------------------------
CREATE TABLE newsletter_subscribers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           citext NOT NULL UNIQUE,
  name            text,
  source          text,
  is_active       boolean NOT NULL DEFAULT true,
  unsubscribed_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- recommendation_events -------------------------------------------------------
CREATE TABLE recommendation_events (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id            uuid REFERENCES customers(id),
  source_product_id      uuid REFERENCES products(id),
  recommended_product_id uuid REFERENCES products(id),
  recommendation_type    text,
  event_type             text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

COMMIT;
