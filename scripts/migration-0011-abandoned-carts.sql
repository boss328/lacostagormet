-- 0011_abandoned_carts.sql
-- La Costa Gourmet — email notifications support tables (Apr 2026)
--
-- Two slices in one migration:
--   1. orders: add tracking_number + shipped_at columns so the admin
--      "Mark as shipped" action can persist the tracking string in a
--      first-class field (used by the order-shipped email template
--      and customer-facing tracking links).
--   2. abandoned_carts: net-new table that captures cart contents
--      keyed by email so the cron sender can email recovery
--      reminders. RLS denies all anon/authenticated access — the
--      table is service-role-only (cron + checkout finalize).
--
-- Run inside the Supabase SQL Editor.

BEGIN;

-- =============================================================================
-- 1. orders: tracking number + ship timestamp
-- =============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS shipped_at      timestamptz;

CREATE INDEX IF NOT EXISTS orders_shipped_at_idx
  ON orders(shipped_at)
  WHERE shipped_at IS NOT NULL;

-- =============================================================================
-- 2. abandoned_carts
-- =============================================================================

CREATE TABLE IF NOT EXISTS abandoned_carts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 citext NOT NULL,
  cart_contents         jsonb NOT NULL,
  subtotal_cents        integer NOT NULL CHECK (subtotal_cents >= 0),
  created_at            timestamptz NOT NULL DEFAULT now(),
  last_updated_at       timestamptz NOT NULL DEFAULT now(),
  recovered_at          timestamptz,
  recovered_order_id    uuid REFERENCES orders(id) ON DELETE SET NULL,
  reminder_sent_count   integer NOT NULL DEFAULT 0,
  last_reminder_sent_at timestamptz,
  unsubscribed_at       timestamptz,
  unsubscribe_token     text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex')
);

-- Lookup by email for the active (un-recovered, un-unsubscribed) cart.
CREATE INDEX IF NOT EXISTS abandoned_carts_active_email_idx
  ON abandoned_carts(email)
  WHERE recovered_at IS NULL AND unsubscribed_at IS NULL;

-- Cron sender's primary scan: stale carts that haven't hit the
-- reminder cap. Index covers both first-pass (count=0) and
-- second-pass (count=1) queries.
CREATE INDEX IF NOT EXISTS abandoned_carts_pending_idx
  ON abandoned_carts(last_updated_at, reminder_sent_count)
  WHERE recovered_at IS NULL AND unsubscribed_at IS NULL;

-- Token lookup for the unsubscribe page.
CREATE INDEX IF NOT EXISTS abandoned_carts_unsub_token_idx
  ON abandoned_carts(unsubscribe_token);

-- last_updated_at trigger. The shared set_updated_at() helper writes
-- NEW.updated_at, but this table uses last_updated_at, so we ship a
-- dedicated touch function. Only fires on cart contents / subtotal
-- changes — bookkeeping columns (recovered_at, reminder_sent_count,
-- unsubscribed_at) update without resetting "last activity."
CREATE OR REPLACE FUNCTION public.touch_abandoned_cart()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.last_updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_last_updated_at_abandoned_carts ON abandoned_carts;
CREATE TRIGGER set_last_updated_at_abandoned_carts
  BEFORE UPDATE OF cart_contents, subtotal_cents ON abandoned_carts
  FOR EACH ROW EXECUTE FUNCTION public.touch_abandoned_cart();

-- RLS — service role only. Public clients hit the table via API routes
-- that authenticate themselves with the service-role key.
ALTER TABLE abandoned_carts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS abandoned_carts_no_anon ON abandoned_carts;
CREATE POLICY abandoned_carts_no_anon
  ON abandoned_carts
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- =============================================================================
-- 3. Sanity check (uncomment after run)
-- =============================================================================
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name = 'orders' AND column_name IN ('tracking_number', 'shipped_at');
--
-- SELECT count(*) FROM abandoned_carts;

COMMIT;
