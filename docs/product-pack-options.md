# Product pack options

Each pack size is a separate purchasable product with its own SKU, total price, availability, image, shipping weight and fulfillment vendor. The catalog shows one card per configured product family, with links to its matching public pack sizes. Related products appear together in the product-page pack selector. Cards, cart, checkout and reorders retain the selected SKU and show a price per bag when configured.

Pack labels state the actual contents, such as **1 bag · 4 lb** or **4 bags · 4 lb each**. The size comes from the saved pack description, never the shipping weight. Dollar savings compare the case price with the same number of purchasable single bags in the same family, only when both net sizes are verified to match. Full product names remain in catalog data and order records; visible pack titles omit redundant packaging and promotional suffixes.

Catalog filters and exact SKU searches select matching products before grouping. A normal browse prefers the smallest available pack; an exact SKU search keeps that SKU. Homepage favorites retain Jeff's featured SKU and offer the other public sizes in the same family. Hidden drafts never appear as options.

## Local fulfillment

After payment, products assigned to a self-fulfilled vendor stay in the local Shipping workflow. Automatic supplier purchase orders are created only for verified external suppliers. Mixed orders keep local and supplier items separate. The supplier Send endpoint also rejects self-fulfilled vendors, so a legacy local draft cannot accidentally be emailed as a drop-ship request.

The October 25 review found no existing self-fulfilled purchase orders requiring cleanup. `pnpm test:shipping` includes regression tests that exercise actual card and wallet finalization, automatic PO creation, and the database's local-shipping reservation rules without charging a payment or buying postage.

## Jeff's starting products

Requested by email on October 24, 2026. Customer prices were confirmed on October 25; these replace the earlier proposed single-bag markup. Wholesale costs remain unknown, so the figures below do not establish profit margins.

| Case SKU | Single SKU | Bag size | Approved pack price | Approved single price | Provisional single shipping weight |
| --- | --- | --- | --- | --- | --- |
| EV4B | EV4B-1 | 4 lb | $170 / 4 bags | $47 | 4.25 lb |
| FV4B | FV4B-1 | 3 lb | $190 / 4 bags | $50 | 3.26 lb |
| OS4B | OS4B-1 | 3 lb | $190 / 4 bags | $50 | 3.25 lb |
| OPC3B-3 (draft) | OPC3B-1 | 3 lb | $147 / 3 bags | $49 | 3.25 lb |
| TS4B | TS4B-1 | 4 lb | $170 / 4 bags | $47 | 4.25 lb |

All five singles remain hidden and out of stock, routed to the existing Home/Garage fulfillment vendor. Before publishing, confirm receipt of warehouse stock and actual packaged shipping weights. The listed single shipping weights are quarter-case estimates. UPCs and case wholesale costs are deliberately not copied onto singles.

The three-bag offer is a distinct hidden `OPC3B-3` option with its own image and URL. Jeff confirmed that he packs only the singles; the three-bag option is assigned to David Rio for supplier fulfillment. Its packaged shipping weight remains unset pending confirmation. The existing supplier-shipped `OPC3B` four-bag case stays at $189 with its original identity; changing that SKU to three bags would alter what existing carts and reorders request. Do not publish the three-bag option until its packaged weight and availability are confirmed.

EV4B/TS4B save $18 per four-pack compared with four singles; FV4B/OS4B save $10. OPC3B-3 has no quantity discount at $147 = 3 × $49. Savings are displayed only when the matching single is publicly purchasable.

## Add another product or pack size

1. In **Admin → Products**, open the base product. For a new product, select **Set up pack options after creating**.
2. In **Pack options**, enter the units in the base pack and a singular unit name such as `bag` or `bottle`.
3. Choose **Add pack option**. Enter the new SKU, name, pack count, total pack price, shipping weight and fulfillment vendor.
4. Write a description for the actual pack. Select a photo only if it shows the correct number of units, or leave it blank and upload from the new product's editor.
5. Leave it hidden until its photo, pricing, stock and fulfillment details are ready. Edit the new SKU to upload its photo and publish it when ready.

The optional premium calculator fills a suggested price only when clicked. Existing case prices are never changed by creating a single. Pack quantities are units sold per SKU: ordering two four-packs means eight bags, charged at two case prices. Stock is tracked per SKU; splitting warehouse cases into singles is not an automatic shared-stock conversion.

## Images

Eleven square 1254 × 1254 PNG assets are in `public/products/david-rio-packs/`, with source prompts in `docs/product-pack-images.json`, including the new three-bag OPC3B composition. They were made with `image_gen.imagegen` from the existing catalog photographs. Pack-count badges are rendered as text in the interface so they remain readable at small sizes.

Generated pack compositions preserve the product/flavor and stated net weight. Tiny reproduced label text is not authoritative product information; original catalog photos remain available in the gallery. The files carry IPTC DigitalSourceType `trainedAlgorithmicMedia`; metadata is inserted without changing image pixels. Google receives original storage URLs, not metadata-stripping display transformations. See [Google's image requirements](https://support.google.com/merchants/answer/6324350?hl=en).

## Deployment and verification

Apply only `supabase/migrations/20261025214603_product_pack_options.sql` before deploying code that queries its columns. Upload the ten assets to `product-images/david-rio-packs-20261025/`, then run `scripts/sql/seed-david-rio-packs.sql`. The guarded transaction preserves existing case pricing and skips already-created singles on reruns. Do not use a blanket migration push against this project's legacy migration history.

The original seed is historical. For the October 25 approved prices, upload `opc3b-3-pack.png`, then run `scripts/sql/apply-approved-david-rio-prices.sql` after taking a catalog backup. This separate guarded transaction changes only approved prices and creates the hidden three-bag draft. Its regression test is `pnpm exec tsx scripts/test-approved-david-rio-prices.ts`. Do not rerun the original seed against the newly approved prices.

After that pricing update, `scripts/sql/assign-opc-three-pack-supplier.sql` records the confirmed David Rio assignment for the three-bag draft. It changes only the fulfillment vendor and leaves the option hidden with its shipping weight unset. The pricing script intentionally rejects reruns after subsequent merchant configuration changes, including this assignment.

Tests cover API authorization, atomic writes and rollback, public visibility, family constraints, generated image metadata, seed idempotence, Merchant feed prices, per-unit calculations, and real SKU checkout routing across card and wallet methods. Storefront checks cover desktop and 320px/390px mobile layouts.

Product pack images and prices can be adjusted through each SKU's existing product editor. To remove a base product, deactivate it or remove its linked options first; deletion now returns an actionable message instead of a database error.
