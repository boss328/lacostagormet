-- 0014_order_refunds.sql
-- La Costa Gourmet — Level 1 refund tracking on orders (Apr 2026)
--
-- Adds nullable bookkeeping columns so the admin "Mark as Refunded"
-- action can record what happened. The actual money movement still
-- happens manually in the Authorize.Net merchant portal — this
-- migration is purely about state in our DB and the customer-facing
-- audit trail.
--
-- order_status enum already includes 'refunded' and 'partially_refunded'
-- (see migration 0001), so no enum mutation is required.
--
-- Run inside the Supabase SQL Editor.

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS refunded_at         timestamptz,
  ADD COLUMN IF NOT EXISTS refund_reason       text,
  ADD COLUMN IF NOT EXISTS refunded_by         text,
  ADD COLUMN IF NOT EXISTS refund_amount_cents integer
    CHECK (refund_amount_cents IS NULL OR refund_amount_cents >= 0);

CREATE INDEX IF NOT EXISTS orders_refunded_at_idx
  ON orders(refunded_at)
  WHERE refunded_at IS NOT NULL;

-- Sanity check (uncomment after run)
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_name = 'orders'
--    AND column_name IN ('refunded_at','refund_reason','refunded_by','refund_amount_cents');

COMMIT;
