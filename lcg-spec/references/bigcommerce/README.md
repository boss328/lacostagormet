# BigCommerce Exports — Data Reference

Raw data exported from La Costa Gourmet's BigCommerce admin on 2026-04-16. These are the authoritative source for customer and order migration. Do not delete these files.

## Files

| File | Format | Contents | Row count |
|---|---|---|---|
| `products-export.csv` | CSV, 87 cols | Full product catalog with names, prices, descriptions, images, categories, SEO | 158 products |
| `orders-export.csv` | CSV, 50+ cols | All orders 2016-2026 with full customer/shipping/product details | 3,187 rows, ~3,139 valid orders |
| `shipments-export.csv` | CSV | Shipment records with tracking numbers, links to orders by Order ID | ~3,494 shipments |
| `customers-export.xml` | XML | Customer records with email, name, phone, company, addresses, notes | 6,337 customers, ~12,025 addresses |
| `skus-inventory-export.csv` | CSV (minimal) | Just SKU, UPC, stock, dims — incomplete export, use products-export.csv instead | ignore |

## Key facts

- **10 years of data** (July 2016 → April 2026)
- **$571K lifetime revenue, 3,139 orders, 709 unique buying customers**
- **6,337 customer accounts** (many created but never ordered)
- Site uses BigCommerce Stencil theme with flat URLs (no `/product/` prefix)

## Catalog-level notes

- 158 products in catalog
- 122 are `Product Visible? = Y` — **only migrate these 122 to the new site**
- 36 are hidden (seasonal, out of stock, or forgotten — ignore)
- 68 catalog SKUs have never sold — candidates for deactivation even among the 122 visible
- 273 SKUs appear in order history total — ~183 are historical/discontinued SKUs no longer in catalog (don't import these, but their historical orders still reference them by SKU string)
- Heavy Big Train concentration — Big Train + Unknown brand (mostly Big Train too) = ~90% of revenue. Brand metadata needs cleaning during migration.

## Customer-level notes

- **42% repeat customer rate, 91% of revenue from repeats.** This is the customer base the new site must not lose.
- **66% of revenue is B2B** (customers with a company name on file) — heavy café/coffeehouse buyer base
- **43% of revenue is California** — local SEO matters a lot
- Top 25 customers are almost all named coffee shops / cafés with recurring 1-2 month buying cycles
- Many customers have multiple addresses (home + business) — preserve this when migrating

## Migration decisions

**Customers:**
- Migrate all 6,337 customers, but flag inactive ones (no orders in 3+ years) separately so marketing emails don't go to stale lists
- All get `needs_password_reset = true` — magic link first-login
- Addresses: import as-is, preserve default shipping/billing flags from the XML

**Orders:**
- Migrate all 3,139 valid orders (skip Cancelled/Declined/Incomplete/Refunded — they bloat the data)
- Order line items come from parsing the `Product Details` column in orders-export.csv (semi-structured string, regex parseable)
- Preserve the `legacy_bc_order_id` as the BC Order ID for customer-service lookups
- Don't re-process any payments — these are historical

**Products:**
- The 122 visible products get imported first
- **Prefer vendor spreadsheets as source of truth for active SKUs** — fresher prices, more complete metadata
- Use BC product export for: slugs (URL preservation), product descriptions Jeff wrote, image URLs (download and rehost)
- Brand metadata is messy — the "Brand Name" column is blank or wrong on many products. Plan to clean up by matching SKU prefixes (e.g. SKU starting with `BT.` is Big Train).

**Shipments:**
- Import tracking numbers and carrier info for historical orders
- Link to orders by `ORDER ID` column
- Marks migrated orders as `delivered` for the fulfillment_status

## Product Details column parsing

The `Product Details` field in orders is a flat string with this format:

```
Product ID: 823, Product Qty: 1, Product SKU: BT.773110, Product Name: Big Train Low Carb Hot Cocoa Mix 2 lb Can, Product Options: , Product Unit Price: $21.95, Product Total: $21.95
```

Multiple products in one order are concatenated with no clear separator except the recurring `Product ID:` pattern. Split on `(?=Product ID:)` as a lookahead regex to extract per-line items.

Regex patterns:
- SKU: `Product SKU:\s*([^,]+)`
- Qty: `Product Qty:\s*(\d+)`
- Name: `Product Name:\s*(.+?)(?=,\s*Product (?:ID|SKU|Unit|Variation|Qty|Options|Total)|$)`
- Line total: `Product Total[^:]*:\s*\$?([\d.]+)`

## Known data quirks

- Some order rows in orders-export.csv are wrapped across multiple lines (CSV with embedded newlines). Use a proper CSV parser (Python `csv.DictReader`, not awk/grep).
- Payment method "Credit Card" covers Authorize.net transactions (2,315 orders). "Authorize.net" as a separate value appears on 77 orders — probably a UI display difference, not a separate payment rail.
- "Pay with Amazon" (374 orders) is Amazon Pay checkout button on the BC site — NOT the Amazon Marketplace storefront. Jeff ALSO runs a separate Amazon Seller Central storefront that is NOT in this BC export data. Those Amazon Marketplace orders live in Seller Central and are out of scope for v1. Phase 2 will integrate Amazon Marketplace order sync into the admin.
- 17 orders have null payment method — very old data, ignore.
- Ship method field is messy ("USPS", "usps", "USpS", etc.) — normalize during migration.
