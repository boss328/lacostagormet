# Shipping QA — October 15, 2026

## Scope and result

Reviewed the new order documents, local shipping UI/API, ShipStation adapter, label downloads, fulfillment SQL and notification flow. Tests use synthetic data and injected provider/email doubles. They do not buy postage or email customers.

| Area | Verification |
| --- | --- |
| Shipping unit and route tests | 43 passing checks: authorization/origin/preview gates, actual body-size bounds, malformed input, reserved/remaining quantities, provider response validation, purchases, recovery, dispatch, email retries, sandbox-key rejection, document selection and PDF conversion |
| Shipping database | 26 passing checks using the actual migrations in PGlite: rollback, quantity bounds, supplier overlap, paid-order requirements, once-only purchase claims, uncertain purchase locks, partial fulfillment, delivered-state preservation, notification leases and role permissions |
| Existing application regressions | 38 additional Node tests pass for catalog filters, category assignments, product image framing, analytics filters, payment reconciliation, wallet providers and verification |
| Related database regressions | Wallet transaction/ownership/replay/permission suite and vendor warehouse/PO schema suite pass |
| Compilation | Next.js production build, lint and TypeScript validation pass |
| Browser workflow | Synthetic partial quote → interrupted purchase → recovery → dispatch → notification retry; manual tracking; blocked supplier items; packing-slip dirty state; long invoice rendering; 390px mobile layout with no horizontal overflow |
| Production database | Both shipping migrations installed; replacement functions verified as invoker functions with fixed search paths, service-role execute access and no anon/authenticated execute access |

## Fixes from this review

- Preserve delivered supplier/order status and the original dispatch timestamp when an action is repeated. Recompute quantities before preserving an order's delivered status.
- Include every source page when converting a purchased label to Letter paper.
- Reject malformed provider costs and responses without losing valid alternative rates or exposing provider payloads.
- Enforce the request limit on actual received bytes, including requests without a Content-Length header; reject malformed JSON/item shapes clearly.
- Block purchases with ShipStation `TEST_` keys and reject explicitly voided labels during printing, recovery and dispatch.
- Open manual tracking by default while provider setup is pending; explain supplier-blocked items and show package input limits.

## Remaining acceptance checks

- Jeff's ShipStation V2 production key, API entitlement, connected carriers, postage billing, origin and return address remain unverified.
- Current production admin access is required for authenticated live screen checks. Local and synthetic authenticated workflows have been exercised.
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
