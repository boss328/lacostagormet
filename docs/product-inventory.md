# Product inventory

Open **Admin → Products → a size → Stock for this size**, or use **Manage stock** beside a pack option. Each SKU is independent: a single canister counts as one unit and a four-bag case also counts as one unit. Opening a case does not convert it into singles automatically.

## Getting started

1. Select the fulfillment vendor and enter the weight of this exact pack with shipping packaging. Save shipping details.
2. Count units available for **new** orders. Exclude items already committed to existing paid orders. Enter the starting quantity and a reason, then choose **Start tracking stock**.
3. Use **Add stock** for deliveries and received returns, or **Remove stock** for damage, loss, or offline sales. Every change records a reason and time. Reserved units cannot be removed.

Tracking is optional per SKU. Existing supplier-managed products keep their availability settings until tracking is explicitly enabled. No opening counts are inferred from stock status. The new canisters still need confirmed counts, fulfillment, and packaged shipping weights.

The panel shows **On hand**, **Reserved**, and **Available** (`on hand − reserved`). Starting tracking and adding units make a configured product available unless it is discontinued. A product with no units or missing shipping setup stays unavailable. Visibility remains a separate setting. The stock-status selector can still pause sales; to resume a paused or discontinued SKU, use its stock-status selector after checking its count and shipping details. Low stock means five or fewer units on hand.

## Orders and payment

Checkout reserves stock before a payment form or wallet session is created. Payment confirmation deducts the reservation once. Manual paid orders deduct stock when their items are inserted. Multiple items in one cart succeed together or roll back together; competing orders cannot reserve more than the available count.

A pending reservation remains held until payment completes or the order is cancelled. There is **no timer-based release**: a late payment may still complete, and one declined hosted-payment attempt does not close every payment token for an order. Before cancelling a storefront order, the administrator must confirm its provider payment is closed or voided and cannot complete. The cancellation control records that confirmation. Reservations are released when a pending order is cancelled; payment-held orders have already deducted stock.

Refunds and cancelled paid/payment-held orders **do not automatically restock**. Receive and inspect the physical items, then use Add stock with a return reason. Shipping updates and repeated payment callbacks do not deduct again. Sandbox wallet orders never reserve or consume real inventory.

Tracking cannot start while older untracked pending or payment-held orders for the SKU remain unresolved. Historical paid orders are not backfilled. Tracked products and committed order lines retain their history; hide a product instead of deleting it.

## Implementation and release

`20261027221701_product_inventory.sql` adds private, RLS-enabled inventory, allocation, and movement tables. Only the server's service role can read or adjust them. Adjustments use a unique request ID, so retrying an uncertain response cannot double-count stock. API writes require admin authentication, same origin, and a writable environment. Fulfillment changes update only that SKU's vendor and weight.

Database statement triggers reserve complete carts under deterministic row locks; order-status triggers commit or release allocations atomically. The wallet preparation function records its environment before inserting items. Public product prices, packaging, and existing inventory remain unchanged by the migration.

The existing wallet schema (`20260916211425_wallet_checkout.sql`) is a prerequisite because inventory must distinguish live and sandbox orders. Production inspection found that schema absent; apply that baseline and this inventory migration together in a guarded transaction, without enabling wallet providers. Do not run a blanket push against the legacy migration history. Then run `pnpm test:inventory`, the existing availability/pack-checkout and wallet/local-fulfillment checks, TypeScript, lint, build, and deployment smoke checks. Browser review uses synthetic local counts; no real stock, payments, email, or postage are created by that review. PGlite verifies transaction behavior, but actual simultaneous PostgreSQL-session testing was unavailable because the local WSL/Docker connection failed.
