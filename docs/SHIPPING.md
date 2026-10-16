# Local shipping: setup and use

## Delivery status and scope

| Phase | Status |
| --- | --- |
| Documentation and activation instructions | Ready; see [Jeff's first shipment](SHIPPING_FIRST_ORDER.md) |
| Implementation and local automated checks | Implemented; database and provider/PDF tests use synthetic data or mocked requests |
| Database migration | Applied to Supabase project `yrlopskyvkdqxmmlxnat` on October 14, 2026 (Pacific); RLS and access verified; existing order data was not rewritten |
| Printing and manual tracking | Implemented; authenticated production document rendering verified. Real dispatch and customer email acceptance remain pending |
| Account setup | V2 API access, six carrier connections, origin/return addresses and live rates verified on October 15, 2026 |
| First live label purchase | Pending; production purchases remain disabled. Actual postage billing and physical printer output are unverified |
| Production code rollout | Released through the repository's GitHub/Vercel integration; verify the deployment check and live admin controls for the release commit |
| Final supplier send safeguards | Prepared locally; apply the database prerequisites in [the supplier release instructions](SUPPLIER_PO_RELEASE.md) before deploying this patch |

ShipStation/API subscriptions, carrier/account charges, and postage are billed to the connected merchant account separately from development. Confirm the account's API entitlement before activation; a ShipStation account alone does not establish that its plan supports the required V2 endpoints. This integration uses a **V2 API key**, not the legacy V1 key/secret pair. See [ShipStation authentication](https://docs.shipstation.com/authentication) and [products and plans](https://docs.shipstation.com/products-and-plans).

This release covers U.S. addresses, USD rates, manually selected order items and quantities, one parcel per local shipment, printed invoices/packing slips, and customer shipment notifications. Supplier purchase orders retain their own fulfillment path. It does not automatically choose items, buy postage when payment arrives, or infer that printing a label means the package has left.

## Jeff's daily workflow

1. Open the paid order in Admin. **Print invoice** uses the order's recorded prices and totals. **Print packing slip** lets you choose the items and quantities going into this package; it omits prices. Verify those selections separately against the parcel's shipping selection. Printing a slip neither reserves quantities nor dispatches an order.
2. Under **Ship from my location**, select the quantities in the packed box. Items already shipped, reserved in another draft, or covered by an active supplier PO are unavailable. If an item has no assigned vendor while the order has a supplier PO, contact developer/support to confirm the PO's contents and explicitly assign the item to its actual supplier or local/self-fulfillment vendor. There is no order-item assignment dropdown in this release; do not clear an assignment to bypass a PO.
3. Enter the full packed weight in pounds and the outside box dimensions in inches. Compare rates, choose the service, and buy the label. This charges the connected shipping account. Quotes expire after 20 minutes; cancel an unpurchased draft and request fresh rates if necessary.
4. Print the purchased PDF from shipment history: **4 × 6** for a thermal printer or **Letter** for regular paper. Use actual size/100% when printing. Reprinting uses the same label and does not buy more postage. Letter output places the original 4 × 6 label on a Letter page. **Print this packing slip** uses the shipment's saved item quantities automatically.
5. Once the package is dispatched, click **Mark shipped & notify customer**. Only then do purchased labels count toward shipped quantities and trigger the customer message. Partial shipments leave the remaining items open.
6. For a package already dispatched using postage bought elsewhere, use **I already have tracking**. Enter the carrier and tracking number, select its quantities, and use the button to record it as shipped and notify the customer. This action immediately records dispatch; it is not a draft tracking entry.

### If an action fails

- **Rates failed:** cancel the failed draft to release its reserved items, correct the address/package/account issue, then request rates again.
- **Purchase status uncertain:** use **Recover status** on that shipment. Recovery only looks up the original attempt. Never buy another label for these items while the outcome is unknown, even when recovery finds no label yet. Check ShipStation or contact support with the order number and shipment ID.
- **Label voided in ShipStation:** the app blocks printing/dispatch of the voided label. Ask support to reconcile the local shipment before preparing replacement postage; this release does not offer an in-app void/replacement workflow.
- **Customer notification pending:** wait two minutes, then use **Retry customer notification**. Retries use the same message key. The app stops retrying after 23 hours from the first attempt to stay inside the provider's deduplication window. Contact support after that window or if retries remain pending; do not create another shipment to resend an email.
- **Browser reload after quoting:** if the rate chooser is gone, cancel the unpurchased draft in history and quote again. Draft quantities remain reserved until cancellation.
- **Supplier PO send needs verification:** the pending PO stays reserved and read-only. Check its email outcome with support before any resend or cancellation; use the [supplier reconciliation instructions](SUPPLIER_PO_RELEASE.md). An interrupted browser response does not establish that no email was sent.

## Configuration

Set these as server environment variables in the intended environment; their names are documented in [.env.example](../.env.example). Keep keys out of browser variables and source control. With `SHIPPING_ENABLED` unset or blank, shipment tools default on only in a production runtime. Printing needs no shipping flags or ShipStation account. Manual tracking needs no ShipStation credentials or origin address; label purchasing remains separately disabled until explicitly activated.

| Variable | Purpose |
| --- | --- |
| `SHIPPING_ENABLED` | Unset/blank uses the production-runtime default; `true` explicitly enables shipment tools; `false` is the kill switch for all shipment mutations |
| `SHIPPING_PURCHASE_ENABLED` | Separate `true` opt-in for live label purchases; keep `false` during initial configuration and rate review |
| `SHIPSTATION_API_KEY` | Production V2 key for real postage; surrounding whitespace is trimmed. `TEST_` sandbox keys permit test rates but cannot purchase labels |
| `SHIPSTATION_SHIP_FROM_JSON` | Complete ship-from address, including contact phone |
| `SHIPSTATION_RETURN_TO_JSON` | Optional complete return address; blank/unset uses ship-from |
| `READ_ONLY_PREVIEW` | `true` blocks shipment changes; Vercel previews default to read-only unless explicitly overridden |

Production means `VERCEL_ENV=production`, or `NODE_ENV=production` when `VERCEL_ENV` is unset. A Vercel preview with `NODE_ENV=production` still defaults off. Read-only mode always blocks mutations, including explicit shipping enablement. Preview deployments cannot purchase labels even if the preview write guard is overridden. A production-mode local server satisfies the fallback gate, so set `SHIPPING_ENABLED=false` when local shipment writes are unwanted and keep purchase activation false for local work.

`SHIPPING_PURCHASE_ENABLED=true` alone is insufficient: purchasing also requires writable shipping tools, a production runtime, a non-sandbox V2 API key, and complete ship-from/return addresses. An existing explicit `SHIPPING_ENABLED=false` in the deployment environment continues to disable manual tracking; the production default does not override that setting.

ShipStation API (formerly ShipEngine) accepts `TEST_` sandbox keys on the same API host as production. The app identifies these keys, labels their quotes as test rates, and blocks all label purchases with them, even when purchase activation is enabled. The ShipStation web platform currently has no sandbox. A key without the sandbox prefix is not proof of valid production access; verify the intended account and carrier connections separately. [ShipStation key and sandbox documentation](https://docs.shipstation.com/authentication).

Example address shape, using placeholders rather than customer or business details:

```json
{
  "name": "Shipping contact",
  "phone": "REPLACE_WITH_PHONE",
  "company_name": "La Costa Gourmet",
  "address_line1": "REPLACE_WITH_STREET",
  "address_line2": "",
  "city_locality": "REPLACE_WITH_CITY",
  "state_province": "CA",
  "postal_code": "REPLACE_WITH_ZIP",
  "country_code": "US"
}
```

Replace every placeholder before activation. Local validation checks required fields and U.S. country shape; it does not prove that an address is deliverable.

### Read-only configuration checker

From the repository root, using the current process environment:

```sh
pnpm exec tsx scripts/check-shipping-config.ts
```

To explicitly load a local environment file with Node 20.12+:

```sh
node --env-file=.env.local --import tsx scripts/check-shipping-config.ts
```

The default check needs no credentials and makes no network or database calls. It reports missing setup, address shape, and activation gates without printing keys or addresses. Sandbox keys receive an explicit notice; requesting purchase activation with one exits `1`. The checker and server both trim surrounding key whitespace. Exit `0` means configuration is internally consistent; disabled or manual-only operation can still have setup pending. Exit `1` means invalid configuration or a failed requested carrier check; exit `2` means unsupported arguments. An exit `0` is not proof of account readiness, migration installation, or deployment.

When a V2 key is securely configured, optionally add:

```sh
node --env-file=.env.local --import tsx scripts/check-shipping-config.ts --check-carriers
```

This makes only `GET https://api.shipstation.com/v2/carriers`. It reports a carrier count or a sanitized failure, never account identifiers, balances, keys, addresses, or the response body. It does not request rates, buy postage, send emails, or write to the database. No key means it fails before sending a request. On Windows, use `pnpm.cmd` if PowerShell blocks the `pnpm` script.

## Activation runbook

1. **Confirm the applied migrations.** `supabase/migrations/20261015023211_local_shipping.sql` was applied through the CLI to project `yrlopskyvkdqxmmlxnat` on October 14, 2026 (Pacific), with RLS/access verified. `20261015074104_shipping_state_idempotency.sql` was applied on October 15; it preserves delivered status and original supplier dispatch times on retries. Existing order data was not rewritten. These create the shipment/item ledger and server-only RPCs and add supplier/local overlap guards. For another environment, apply both files through the reviewed release process before enabling shipping. The final supplier PO patch also requires the older missing `0006_vendor_warehouses_and_po.sql` and new `20261015230709_supplier_po_send_claim.sql`; follow the [supplier release order](SUPPLIER_PO_RELEASE.md) before deploying it.
2. **Deploy the reviewed implementation with purchases disabled.** The initial implementation shipped in PR #5, followed by fixes in PRs #6 and #7. Keep `SHIPPING_PURCHASE_ENABLED` unset or `false`. With `SHIPPING_ENABLED` unset, production offers printing and manual tracking without further ShipStation setup. An explicit `false` still disables mutations. Authenticated production invoice/packing-slip HTTP checks, invalid selection rejection, anonymous shipping denial and cross-origin shipping write rejection passed on October 15. Live authenticated browser rendering remains a separate acceptance check. Manual tracking is a real dispatch action that can email the customer; use an authorized dispatched package when verifying it. The checker does not deploy code or verify the remote schema.
3. **Confirm Jeff's account setup for labels.** Obtain the V2 key through the provider's account settings, confirm that its API plan supports carrier listing/rates/labels, connect the intended carriers, and confirm postage billing. A ShipStation platform key can perform live paid operations; do not assume it is a sandbox key. [Provider authentication and sandbox distinctions](https://docs.shipstation.com/authentication).
4. **Configure origin and return addresses.** Enter the V2 key, actual shipping contact, phone, and U.S. addresses as server variables. Run the default checker, then the optional carrier check. A successful carrier check establishes API access to carrier listing, not successful label purchasing. Production API/origin setup and carrier access were verified on October 15.
5. **Verify rate preparation.** With writable shipping tools and provider setup complete, validate a paid order's available quantities, supplier assignment handling, package inputs, and rate comparison. Requesting rates reserves the selected quantities and creates a provider shipment; it does not buy a label. Cancel test drafts afterward. Keep `SHIPPING_PURCHASE_ENABLED` unset or `false` through this step. Production test order LCG-10093 returned 50 rates after the restricted-media-service fix. Its unpurchased local draft was cancelled and its quantity released; no postage or customer email occurred. Local cancellation does not delete the rate-created provider shipment.
6. **Complete the first live purchase with Jeff.** After account/setup checks, enable `SHIPPING_PURCHASE_ENABLED=true` in production and use an approved paid parcel. Confirm the quoted charge, buy once, verify tracking and both PDF formats, print the packing slip for the actual parcel quantities, and confirm the label does not mark the order shipped. Dispatch the package, mark it shipped once, and verify the customer notification and order tracking. Confirm remaining items stay open for a partial shipment. This first purchase is pending and incurs postage.
7. **Record the acceptance outcome.** Record the environment, migration status, order/shipment IDs, carrier/service, PDF checks, dispatch status, and notification outcome without storing keys or full addresses. If purchases need to pause, set `SHIPPING_PURCHASE_ENABLED=false`; existing labels and recovery remain available while shipping tools stay enabled. Setting `SHIPPING_ENABLED=false` stops all shipment mutations, including recovery/notification retries, but leaves authenticated document and label reads available.

## Implementation and local verification

### Saved box templates (pending release)

The order shipping panel offers **Saved box**, **New box template**, **Edit box** and **Delete box**. Templates store a name and outside dimensions in inches, shared across orders through `public.shipping_box_templates`. Each package still requires its actual packed weight; selecting a template only fills length, width and height. Editing custom dimensions does not update a saved template. Existing shipment drafts and labels keep their original package data.

Apply `20261016002226_shipping_box_templates.sql` once before deploying these controls, following the full branch release order in [SUPPLIER_PO_RELEASE.md](SUPPLIER_PO_RELEASE.md). This new migration is local only. It enables RLS, grants CRUD only to the server role, enforces positive dimensions up to 108 inches and unique case-insensitive names, and advances a timestamp for stale-edit protection. `/api/admin/shipping/box-templates/` uses admin authentication for reads plus origin and read-only-preview guards for writes. Template storage does not depend on ShipStation credentials or purchase activation. Unavailable template storage leaves custom package input usable.

### Shipment processing

The admin shipping API is `src/app/api/admin/orders/[orderNumber]/shipping/route.ts`; provider/configuration/PDF helpers are under `src/lib/shipping/`. Shipment mutations lock the order row before calculating quantities. A stored rate must belong to that shipment, purchases can be claimed only once, and uncertain purchases retain their quantities until resolved. Purchased labels and manual dispatches contribute to item-level fulfillment; supplier completion alone cannot finish an order with outstanding local items.

Customer notifications use a stable key per shipment, a two-minute in-flight claim, and a 23-hour retry cutoff. Email delivery is distinct from shipment persistence; failures remain visible for retry/support review. Provider credentials and private label URLs remain on the server.

Run these checks without ShipStation credentials or production database access:

```sh
pnpm test:shipping
pnpm exec tsx scripts/check-shipping-config.ts
pnpm exec tsc --noEmit
```

The database suite uses in-memory PGlite and synthetic roles/orders. Its concurrent callers share one serialized connection, so it does not prove multi-connection PostgreSQL lock contention. Route tests execute the real handlers with explicit storage, provider, and email boundary doubles; they never reach live services. Provider tests use injected mock fetch responses, and PDF tests use generated multi-page files. These checks do not verify Jeff's API key, real carrier charges, printer output, live email delivery, or production rollout.
