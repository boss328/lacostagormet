# Shipping QA — October 15, 2026

## Scope and result

Reviewed the new order documents, local shipping UI/API, ShipStation adapter, label downloads, fulfillment SQL and notification flow. Tests use synthetic data and injected provider/email doubles. They do not buy postage or email customers.

| Area | Verification |
| --- | --- |
| Shipping unit and route tests | 55 passing checks: authorization/origin/preview gates, supplier PO state transitions and send claims, actual body-size bounds, malformed input, reserved/remaining quantities, provider response validation, merchandise service eligibility, purchases, recovery, dispatch, email retries, sandbox-key rejection, document selection and PDF conversion |
| Shipping database | 26 passing checks using the actual migrations in PGlite: rollback, quantity bounds, supplier overlap, paid-order requirements, once-only purchase claims, uncertain purchase locks, partial fulfillment, delivered-state preservation, notification leases and role permissions |
| Supplier send database | 11 passing PGlite checks: one send claim, frozen payloads, cancellation ordering, failed finalization, unresolved-send dispatch denial, repeatable migration and preserved RPC permissions |
| Existing application regressions | 38 additional Node tests pass for catalog filters, category assignments, product image framing, analytics filters, payment reconciliation, wallet providers and verification |
| Related database regressions | Wallet transaction/ownership/replay/permission suite and vendor warehouse/PO schema suite pass |
| Compilation | Next.js production build, lint and TypeScript validation pass |
| Browser workflow | Synthetic partial quote → interrupted purchase → recovery → dispatch → notification retry; manual tracking; blocked supplier items; packing-slip dirty state; long invoice rendering; 390px mobile layout with no horizontal overflow |
| Production database | Both shipping migrations installed; replacement functions verified as invoker functions with fixed search paths, service-role execute access and no anon/authenticated execute access |
| Production integration | ShipStation V2 account, six carrier connections, default origin/return addresses and authenticated admin HTTP checks verified. Live quotes returned on a zero-dollar, clearly marked test order; draft cancellation released the reserved item. No postage or customer email sent. |

## Fixes from this review

- Preserve delivered supplier/order status and the original dispatch timestamp when an action is repeated. Recompute quantities before preserving an order's delivered status.
- Include every source page when converting a purchased label to Letter paper.
- Reject malformed provider costs and responses without losing valid alternative rates or exposing provider payloads.
- Enforce the request limit on actual received bytes, including requests without a Content-Length header; reject malformed JSON/item shapes clearly.
- Block purchases with ShipStation `TEST_` keys and reject explicitly voided labels during printing, recovery and dispatch.
- Open manual tracking by default while provider setup is pending; explain supplier-blocked items and show package input limits.
- Exclude Media Mail, Library Mail and Bound Printed Matter from merchandise quotes. Reject previously saved restricted service quotes before claiming a purchase or calling ShipStation. The live quote test exposed Media Mail as the cheapest service before this fix.
- Restrict supplier PO cancellation to the current draft state and acknowledgment to the current sent state. Atomic conditional updates reject stale tabs with a conflict instead of changing already shipped/delivered POs. Route tests cover every PO state, repeated requests and a status change immediately before the update executes. This final fix is prepared locally for the next release.
- Claim and freeze a supplier PO before contacting the email provider. Block duplicate sends, cancellation, edits and dispatch while a pending send is unresolved; check both claim and finalization storage results. Explicit UI request state prevents overlapping clicks, and uncertain sends stay locked for support reconciliation rather than blind retry.

## Final release review

- Production remains at `562483b` while the supplier PO status fix is prepared on `fix/supplier-po-states`; no production changes were made during this final review.
- The existing 38 application test entries and both wallet/vendor PGlite suites passed again. Authenticated live document/configuration/access checks also passed.
- Live Chrome checks confirmed category navigation, the coffee category's products, Lion Coffee filtering, ascending price sorting, add-to-cart totals and checkout rendering. The test cart item was removed afterward; the cart is empty again. No payment or new order was submitted and no console errors were captured.
- A local browser fixture using the real supplier editor confirmed the in-progress lock, interrupted-response warning, persisted-claim lock and normal fulfillment controls after a completed send. Its fetch boundary was mocked; no real supplier email or database calls were possible.
- Read-only production schema inspection found the existing vendor warehouse migration missing. The [supplier release instructions](SUPPLIER_PO_RELEASE.md) record that prerequisite and the new send-claim migration; these have not been applied to production during this review.
- [Jeff's first shipment](SHIPPING_FIRST_ORDER.md) covers parcel preparation, label printing, dispatch, recovery and the first supervised paid-label acceptance.

## Remaining acceptance checks

- Production credentials, API access, connected carriers and origin/return addresses are verified. Actual postage billing remains unverified.
- Authenticated production HTTP checks passed; live authenticated browser rendering remains pending. Local and synthetic authenticated browser workflows have been exercised.
- The first real label purchase, real customer email delivery, physical printer output and a real customer tracking journey remain pending. Keep purchase activation disabled until an approved parcel is ready.
- PGlite uses a serialized connection. Its overlap tests do not prove contention behavior across independent PostgreSQL connections.
- Browser print-preview automation was unavailable; document rendering and multi-page PDF conversion were checked separately.
- Supabase advisors reported the same pre-existing mutable-search-path, public-extension and leaked-password-protection warnings; none were introduced by these shipping migrations.

## Reproduce

```sh
pnpm test:shipping
pnpm exec tsx scripts/test-wallet-database.ts
pnpm exec tsx scripts/test-vendor-database.ts
pnpm build
```

Other Node test files run with `node --conditions=react-server --import tsx --test` so server-only wallet modules load in their intended environment. Windows PowerShell users can use `pnpm.cmd`.
