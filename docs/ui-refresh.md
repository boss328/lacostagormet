# Storefront and admin UI refresh

## Review scope

Branch `feat/storefront-ui` starts from the existing `feat/wallet-checkout` work. It does not change the live branch or activate wallets. Keep this as a draft until the new storefront and connected checkout are approved.

The approved homepage now uses the actual Next.js catalog and shopping cart. Shared navigation, category dropdown, product cards, search, product pages, cart, checkout, customer account, service pages, and the full admin workspace use one responsive visual system. The green/purple logo, hot-coffee hero, pineapple smoothie, fruit/nut oatmeal, and clear-glass boba imagery are retained.

## Functionality map

| Surface                             | Existing behavior retained / changes                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Home, shop, search, brand, category | Live active catalog; shared search, brand, category and sort controls; removable filters; stable 24-product pagination               |
| Product                             | Image gallery, pricing, stock state, quantity, add to cart, related products, structured data                                        |
| Cart and checkout                   | Persistent cart, quantity/remove, recovery, address collection, shared shipping calculation, Authorize.Net and prepared wallet flows |
| Customer account                    | Supabase login/session guard, orders and order details, reorder, addresses, settings                                                 |
| Business/contact                    | Existing inquiry submission and validation                                                                                           |
| Admin dashboard                     | Range-aware sales charts, daily/weekly/monthly controls, top products by revenue or units, lifetime/retention and stock panels       |
| Orders/customers                    | Search, views, pagination, CSV export, details, manual order, fulfillment/cancel/refund actions                                      |
| Products/categories/brands          | Search, active/stock/category/brand controls, pagination, editors, CSV import/export, associations                                   |
| Vendors/warehouses/purchase orders  | Search/status controls, editors, purchase-order save/send/acknowledge/ship/cancel, settings                                          |
| Inquiries/imports                   | Status filters, pagination, inquiry actions, existing import tools                                                                   |
| Backend jobs                        | Existing payment callbacks, webhooks, cart recovery, order notifications, feeds and email jobs remain connected                      |

## Filtering fixes

- Invalid brand/category filters return no matches rather than exposing the whole catalog. Invalid route slugs return 404.
- Search is literal and case-insensitive. Admin search escapes regex and PostgREST syntax; punctuation cannot expand the query.
- Filters combine, reset pagination, survive Back/Forward, and are preserved by page links. Price sorting is numeric and includes a stable ID tie-breaker.
- Category matching includes primary and many-to-many memberships plus descendants without duplicate products.
- The eight homepage collections preserve the approved merchandising assignments. `collection-sources.json` records the current underlying catalog categories: subsequent admin category moves replace the original mapping; added categories extend it. New products are classified from their category and product name. Three savory soup latte products remain available through All products and All specialty beverages.
- Admin global search uses the same signed login session as the rest of the admin UI. Admin product/inquiry/purchase-order lists page beyond the former 200-record cap. Exports read all matching rows in batches.
- Dashboard product/brand/state panels now honor the selected range; chart granularity controls receive daily source data. The pending-shipment shortcut opens the correct order view. Sales summaries and joined item analytics page beyond the API row cap.
- Free shipping starts at $80 consistently in cart, server pricing and copy; the existing lower shipping tiers and regional surcharge remain intact.

## Review deployment

Vercel preview deployments default to read-only. `READ_ONLY_PREVIEW=true` enables the same protection locally. Middleware blocks writes, order/payment callbacks, cron jobs and email callbacks; checkout and customer login clearly show the limitation. Admin login/logout and catalog reads remain available.

Use public catalog credentials for visual review. Use an isolated database and sandbox payment/email credentials for write tests. Only set `READ_ONLY_PREVIEW=false` when that isolated environment is configured. Do not use the repository's production smoke script for review: it writes audit records.

## Validation

- Production build and TypeScript/lint checks.
- Catalog/unit regressions, analytics date boundaries, Authorize.Net signing, wallet unit tests and transactional database tests.
- `scripts/check-catalog.ts`: 238 active products, 24 brands, 1,200 category/brand/sort combinations, full pagination, and real PostgREST literal-search comparisons.
- Desktop/mobile browser checks: combined filters and Back navigation, product gallery and quantity, persistent cart, checkout layout/validation, admin login/search.
- Local route smoke checks verify public routes, protected account/admin routes and preview write rejection.

Private customer data, real payment capture, live emails and admin mutations are deliberately outside the public-catalog review environment. Those require a sandbox acceptance pass before production release. No production database writes, outgoing customer emails or payment transactions were performed during this refresh.

## Existing database prerequisite found during review

The connected catalog database is missing `vendors.terms` and `vendor_warehouses` from the repository's existing `0006_vendor_warehouses_and_po.sql` migration. The vendor and purchase-order pages now display a setup notice instead of silently showing an empty list or failing with an opaque error. The migration is validated locally; it has **not** been applied to the live database. Apply it to staging and run vendor/warehouse/PO acceptance tests before releasing these workflows. Purchase-order item counts are now scoped to the assigned vendor as well as the order.
