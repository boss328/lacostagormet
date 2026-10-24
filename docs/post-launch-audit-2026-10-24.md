# La Costa Gourmet post-launch audit — October 24, 2026

Source: Ahron Duben, “La Costa Gourmet – post-launch fixes,” October 24.

## Request map

| Item | Change |
| --- | --- |
| 1 | `/gourmet-sauces-and-syrups/` → `/shop/syrups/` |
| 2 | `/frappe-mixes/` → `/shop/chai-and-matcha/` |
| 3 | `/cocoa/` → `/shop/specialty-beverages/` |
| 4 | `/protein-supplements/` → `/shop/protein-and-energy/` |
| 5 | Product titles keep the existing product name when it already begins with the brand; matching handles case, whitespace, trademarks and word boundaries. |
| 6 | Categories, brands and the six public information pages get their own descriptions. New administrator-created brands/categories receive name-specific descriptions. |
| 7 | Homepage, shop, category, brand and information pages receive Open Graph and Twitter titles, descriptions and images. |
| 8 | Rename the category and storefront collection label to **Specialty Beverages**, preserving its category ID and URL. |
| 9 | Correct manufacturer assignments previously grouped under “OatMilk”; see below. |
| 10 | Use `island-oasis` and `minor-figures`, with explicit 301 redirects from the old brand slugs. |
| 11 | Audit the inventory source; expose manual availability in product editing and enforce the same availability rules in the storefront, checkout and feed. |

The six explicitly requested legacy redirects use HTTP 301. The existing Next.js trailing-slash normalization remains intact for checkout callbacks and other integrations. Brand catalog pages no longer receive the cache policy intended for static logo files.

## Brand correction

The legacy OatMilk brand contains six products, not just Minor Figures. Renaming all six products to Minor Figures would submit incorrect manufacturer information to Google. The migration preserves product IDs, SKUs, prices, availability, product URLs and category assignments:

| SKU | Correct brand | Existing product visibility |
| --- | --- | --- |
| USMK-02032006 | Minor Figures | Active |
| USMK-01032006 | Minor Figures | Active |
| 00661 | Tulip by Hollander | Active |
| 00660 | Tulip by Hollander | Active |
| 63032 | Oatly | Inactive |
| 19096 | Planet Oat | Inactive |

The existing OatMilk brand ID becomes Minor Figures. Separate brands are created for the other manufacturers; brands belonging only to the two inactive products are also inactive. No product is activated by this change. The migration stops if unexpected SKUs have been added to the legacy brand, and tests cover rollback, uniqueness conflicts and repeat application.

## Inventory findings

At audit time, all 253 active products and 15 inactive products had `stock_status = 'in_stock'` in production. The website and feed were reflecting those stored values. This is **not evidence of physical stock**.

No automatic inventory connector was found in the application or deployed database:

- Products store a status, without an on-hand quantity or inventory-source field.
- The original BigCommerce import omitted inventory status; the database default is `in_stock`.
- Product CSV import and admin API updates can change stock status manually.
- The database has no inventory/sync tables, scheduled inventory jobs or product stock triggers; its only product trigger maintains `updated_at`.
- ShipStation is used for shipping rates and labels; that integration does not import inventory.

The product editor now exposes **In stock**, **Low stock**, **Out of stock** and **Discontinued**. In stock and low stock remain purchasable. Out of stock, discontinued and unrecognized values are unavailable across product cards/details, reorder, checkout and structured data. Card and wallet checkout validate current catalog status before creating payment sessions/orders. The feed's cache window is shortened to five minutes without the previous 24-hour stale allowance; Google still updates listings on its own fetch schedule.

No quantities or stock statuses were invented or bulk changed. Automatic synchronization requires identifying the authoritative stock system and connecting it separately. Until then, Jeff must maintain availability through the product editor or CSV import.

## Release checks

- Redirect regression suite, including query preservation and payment-route exclusions.
- Metadata tests for brand duplication, descriptions, social images and canonicals.
- Catalog migration tests with a local PostgreSQL-compatible test database.
- Availability and checkout regression tests, production build and lint.
- Read-only deployed page/feed audit: `node scripts/test-post-launch-live.mjs`.
- Existing integration routing smoke test: `pnpm smoke`.

Only the new catalog correction SQL is applied. Production's historical migrations are not replayed.
