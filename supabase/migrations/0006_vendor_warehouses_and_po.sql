-- 0006_vendor_warehouses_and_po.sql
-- Vendor purchase-order system: warehouses, PO snapshot items, terms.
--
-- Decisions made during implementation (Phase 6 polish + vendor PO build):
--
-- 1. The existing `vendor_orders` table already covers everything the spec
--    asked for under the name `vendor_purchase_orders` (status, email_subject,
--    email_body, email_sent_at, etc.). We REUSE `vendor_orders` rather than
--    adding a parallel `vendor_purchase_orders` table. The admin UI will
--    refer to these as "POs" but the underlying table stays vendor_orders.
--
-- 2. The existing `vendor_order_status` enum lacks a 'draft' value. Rather
--    than altering the enum (which can't run inside the same transaction as
--    inserts), we map: draft → 'pending' (DB), 'acknowledged' → 'confirmed'.
--    UI surfaces the friendly labels.
--
-- 3. We do NOT add a separate `vendor_po_items` table. order_items already
--    has assigned_vendor_id and unit_wholesale_cost — that's the snapshot.
--    Joining order_items → vendor_orders by (order_id, vendor_id) gives us
--    the PO line items without duplicating data.
--
-- Apply by pasting into the Supabase SQL Editor.

BEGIN;

-- vendor_warehouses ----------------------------------------------------------
-- Each vendor can have N warehouses. The `is_primary` flag picks the default
-- one to pre-select when drafting a PO.
CREATE TABLE IF NOT EXISTS vendor_warehouses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  label       text NOT NULL,
  city        text,
  state       text,
  zip         text,
  is_primary  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vendor_warehouses_vendor_id_idx
  ON vendor_warehouses(vendor_id);
CREATE TRIGGER set_updated_at_vendor_warehouses BEFORE UPDATE ON vendor_warehouses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enforce: only one primary warehouse per vendor (partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS vendor_warehouses_one_primary_per_vendor
  ON vendor_warehouses(vendor_id) WHERE is_primary = true;

ALTER TABLE vendor_warehouses ENABLE ROW LEVEL SECURITY;

-- vendor_orders extensions --------------------------------------------------
ALTER TABLE vendor_orders
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES vendor_warehouses(id),
  ADD COLUMN IF NOT EXISTS sent_by      text,                    -- admin email or 'system'
  ADD COLUMN IF NOT EXISTS total_wholesale numeric(10,2);        -- snapshot at draft

CREATE INDEX IF NOT EXISTS vendor_orders_warehouse_id_idx
  ON vendor_orders(warehouse_id);

-- vendors extensions --------------------------------------------------------
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS terms text;                            -- "Net 30", etc.

-- settings table extensions for vendor PO defaults --------------------------
-- The `settings` table already exists as a key/value store. No schema change
-- needed — we just write rows like:
--   ('vendor_po.auto_draft', 'true')
--   ('vendor_po.default_reply_to', 'jeff@lacostagourmet.com')
--   ('vendor_po.attach_csv', 'false')
--   ('vendor_po.signature', 'Thanks,\nLa Costa Gourmet\n(760) 931-1028')

COMMIT;
