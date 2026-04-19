-- 0005_payment_audit_log.sql
-- Phase 4 hardening — append-only audit trail for payment lifecycle events.
--
-- Captures every partial success/failure in checkout so a missing payments
-- row or a stuck order status has a forensic record. Distinct from the
-- general-purpose `audit_log` table: this one is payment-shaped (order_id,
-- transaction_id, amount_cents, raw redacted response, error detail).
--
-- Apply manually via Supabase SQL Editor (matching 0001–0004 pattern).

BEGIN;

CREATE TABLE payment_audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid REFERENCES orders(id),
  event_type     text NOT NULL,
  transaction_id text,
  amount_cents   integer,
  raw_response   jsonb,
  error_detail   text,
  source         text NOT NULL DEFAULT 'system',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_audit_log_order
  ON payment_audit_log(order_id);

CREATE INDEX idx_payment_audit_log_event
  ON payment_audit_log(event_type, created_at);

-- Known event_type values (enforced at application level, not via ENUM so
-- Phase 7+ can add new event types without a migration):
--
--   payment_inserted             — payments row written successfully
--   payment_insert_failed        — auth.net charged but payments insert errored
--   status_update_failed         — payments row fine, orders.status update errored
--   status_update_succeeded      — happy-path status transition
--   manual_backfill              — scripts/backfill-order-payment.ts wrote a row
--   auth_net_approved            — charge succeeded, pre-DB audit point
--   auth_net_declined            — charge declined, no money moved
--   auth_net_network_error       — no response from Auth.net
--   auth_net_held_for_review     — AFDS fired
--
-- raw_response is always the redacted shape produced by lib/authnet/safe-json.ts
-- (no card data, no tokens, no keys). Safe to review from admin UI.

COMMENT ON TABLE payment_audit_log IS
  'Append-only payment lifecycle audit. Every checkout writes at least one row (success or failure). See docs for event_type vocabulary.';

COMMIT;
