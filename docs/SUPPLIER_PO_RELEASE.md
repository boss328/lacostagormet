# Supplier PO release — October 15, 2026

## Why this patch is needed

A stale tab could cancel or acknowledge a PO after another tab marked it shipped. Separately, sending a supplier email could overlap cancellation: the supplier might receive an order after its items became available for local shipping.

The patch checks the current status in each update and records a send claim before contacting the email provider. Claimed drafts stay reserved, cannot be edited/cancelled and cannot be resent automatically. Uncertain email outcomes require reconciliation rather than another send.

## Apply the database updates before the code release

This patch is prepared locally on `fix/supplier-po-states`. Production remains at `562483b`; no production database changes were made during the final review.

Read-only production inspection confirmed that the older vendor warehouse migration has not been applied: `vendor_warehouses` is absent, and `vendor_orders` has no `warehouse_id`, `sent_by` or `total_wholesale` columns. Existing supplier screens already expect those fields.

1. Confirm the linked project is La Costa's `yrlopskyvkdqxmmlxnat` and record the current Vercel production deployment for rollback.
2. Review and apply `supabase/migrations/0006_vendor_warehouses_and_po.sql` once. It adds the supplier warehouse table, enables its RLS and adds the PO fields already used by the application. Its trigger creation is not repeatable; check whether it was applied before rerunning it.
3. Review and apply `supabase/migrations/20261015230709_supplier_po_send_claim.sql`. It adds the send claim and protects an unresolved send from being marked shipped.
4. Review and apply `supabase/migrations/20261016002226_shipping_box_templates.sql` for the saved-box feature added to this branch. It creates an empty admin-only template table; no existing orders, shipments or labels are changed. This migration must be applied once, before deploying the new template controls.
5. Verify the expected tables/columns and the updated shipment function in that database, and run Supabase advisors to confirm no new access warnings. The new box table must have RLS enabled, no anon/authenticated table privileges, and CRUD access for service_role only.
6. Deploy this branch through the normal reviewed GitHub/Vercel release. Keep postage purchasing disabled.
7. Verify authenticated supplier PO pages and the new read-only warning for any claimed draft. Exercise real sending only with an approved PO and recipient; the automated tests use synthetic data and never email suppliers.
8. In a paid order's **Ship from my location** section, create a named box, reload and select it. Verify its three dimensions fill in and the packed weight stays independent. Check edit/delete and custom dimensions before requesting rates. Template changes alone never request postage or notify customers.

Do not run a blanket `supabase db push` against this project: historical migrations are not fully represented in its migration history. Apply only the reviewed files required for this release. The new supplier routes reject requests before sending email if required storage is unavailable.

## Reconcile an uncertain supplier email

A draft with `email_send_started_at` set is locked. It may represent an in-progress request, a provider error, a timeout, or an email accepted by the provider whose final database update failed. The UI must not offer a blind resend.

Support should identify the exact PO and send attempt, then check the email provider's authoritative records and, when necessary, confirm receipt with the supplier. Do not clear the claim merely because the browser reported an error or no email is immediately visible.

- If acceptance is confirmed, reconcile the recorded provider message ID, sent time and PO status without sending another email.
- If authoritative evidence confirms the request was never accepted and there is no in-flight request, the exact PO can be returned to an editable draft through a reviewed maintenance action.
- If the outcome remains uncertain, keep it locked and reserved for investigation.

There is no automated retry or reconciliation button in this release. Claims deliberately remain locked across failed responses and page reloads.

## Rollback

The schema additions are backward compatible, but rolling back to code that ignores send claims reopens the race. If this release needs rollback while any send claim is unresolved, pause supplier send/cancel activity and reconcile those claims first. A code rollback never retracts an email already accepted by the provider.
