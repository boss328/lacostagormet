-- 0004_add_cart_hash.sql
-- Phase 4 — checkout idempotency.
--
-- Adds cart_hash + client_ip columns to orders so the checkout API can
-- dedupe double-submits within a 5-minute window without double-charging.
--
-- Apply manually via Supabase SQL Editor (matching how 0001–0003 were
-- applied — not via CLI migration tool).
--
-- NOTE: the original spec for this migration wrote the partial-index WHERE
-- as `payment_status = 'pending'`, but `orders` has no `payment_status`
-- column — the order-level lifecycle lives on `orders.status`
-- (order_status enum: pending/payment_held/paid/cancelled/refunded/...).
-- Adjusted the partial predicate to `status = 'pending'` accordingly.

BEGIN;

ALTER TABLE orders
  ADD COLUMN cart_hash text,
  ADD COLUMN client_ip text;

CREATE INDEX idx_orders_cart_hash_recent
  ON orders(cart_hash, created_at)
  WHERE status = 'pending';

COMMENT ON COLUMN orders.cart_hash IS
  'SHA-256 hash of normalised cart contents for idempotency. Deduplicates double-submit within a window.';

COMMENT ON COLUMN orders.client_ip IS
  'Request IP captured at checkout submit. Used alongside cart_hash for dedup lookup.';

COMMIT;
