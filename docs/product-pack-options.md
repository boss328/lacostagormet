# Product pack options

Each pack size is a separate purchasable product with its own SKU, total price, availability, image, shipping weight and fulfillment vendor. The catalog shows one card per configured product family, with links to its matching public pack sizes. Related products appear together in the product-page pack selector. Cards, cart, checkout and reorders retain the selected SKU and show a price per bag when configured.

Pack labels state the actual contents, such as **1 bag · 4 lb** or **4 bags · 4 lb each**. The size comes from the saved pack description, never the shipping weight. Dollar savings compare the case price with the same number of purchasable single bags in the same family, only when both net sizes are verified to match. Full product names remain in catalog data and order records; visible pack titles omit redundant packaging and promotional suffixes.

Catalog filters and exact SKU searches select matching products before grouping. A normal browse prefers the smallest available pack; an exact SKU search keeps that SKU. Homepage favorites retain Jeff's featured SKU and offer the other public sizes in the same family. Hidden drafts never appear as options.

## Local fulfillment

After payment, products assigned to a self-fulfilled vendor stay in the local Shipping workflow. Automatic supplier purchase orders are created only for verified external suppliers. Mixed orders keep local and supplier items separate. The supplier Send endpoint also rejects self-fulfilled vendors, so a legacy local draft cannot accidentally be emailed as a drop-ship request.

The October 25 review found no existing self-fulfilled purchase orders requiring cleanup. `pnpm test:shipping` includes regression tests that exercise actual card and wallet finalization, automatic PO creation, and the database's local-shipping reservation rules without charging a payment or buying postage.

## Jeff's starting products

Requested by email on October 24, 2026. The existing four-bag case prices remain unchanged. The proposed single-bag prices below add 10% over the unrounded case price per bag; they are not approved selling prices yet.

| Case SKU | Single SKU | Bag size | Case price | Proposed single price | Provisional single shipping weight |
| --- | --- | --- | --- | --- | --- |
| EV4B | EV4B-1 | 4 lb | $188.95 | $51.96 | 4.25 lb |
| FV4B | FV4B-1 | 3 lb | $188.95 | $51.96 | 3.26 lb |
| OS4B | OS4B-1 | 3 lb | $188.95 | $51.96 | 3.25 lb |
| OPC3B | OPC3B-1 | 3 lb | $189.00 | $51.98 | 3.25 lb |
| TS4B | TS4B-1 | 4 lb | $188.95 | $51.96 | 4.25 lb |

The seed creates all five singles hidden and out of stock, routed to the existing Home/Garage fulfillment vendor. Before publishing, confirm the selling prices, receipt of warehouse stock, and actual packaged shipping weights. The listed shipping weights are quarter-case estimates. UPCs and case wholesale costs are deliberately not copied onto singles.

## Add another product or pack size

1. In **Admin → Products**, open the base product. For a new product, select **Set up pack options after creating**.
2. In **Pack options**, enter the units in the base pack and a singular unit name such as `bag` or `bottle`.
3. Choose **Add pack option**. Enter the new SKU, name, pack count, total pack price, shipping weight and fulfillment vendor.
4. Write a description for the actual pack. Select a photo only if it shows the correct number of units, or leave it blank and upload from the new product's editor.
5. Leave it hidden until its photo, pricing, stock and fulfillment details are ready. Edit the new SKU to upload its photo and publish it when ready.

The optional premium calculator fills a suggested price only when clicked. Existing case prices are never changed by creating a single. Pack quantities are units sold per SKU: ordering two four-packs means eight bags, charged at two case prices. Stock is tracked per SKU; splitting warehouse cases into singles is not an automatic shared-stock conversion.

## Images

Ten square 1254 × 1254 PNG assets are in `public/products/david-rio-packs/`, with source prompts in `docs/product-pack-images.json`. They were made with `image_gen.imagegen` from the existing catalog photographs. One- and four-pack badges are rendered as text in the interface so they remain readable at small sizes.

Generated pack compositions preserve the product/flavor and stated net weight. Tiny reproduced label text is not authoritative product information; original catalog photos remain available in the gallery. The files carry IPTC DigitalSourceType `trainedAlgorithmicMedia`; metadata is inserted without changing image pixels. Google receives original storage URLs, not metadata-stripping display transformations. See [Google's image requirements](https://support.google.com/merchants/answer/6324350?hl=en).

## Deployment and verification

Apply only `supabase/migrations/20261025214603_product_pack_options.sql` before deploying code that queries its columns. Upload the ten assets to `product-images/david-rio-packs-20261025/`, then run `scripts/sql/seed-david-rio-packs.sql`. The guarded transaction preserves existing case pricing and skips already-created singles on reruns. Do not use a blanket migration push against this project's legacy migration history.

Tests cover API authorization, atomic writes and rollback, public visibility, family constraints, generated image metadata, seed idempotence, Merchant feed prices, per-unit calculations, and real SKU checkout routing across card and wallet methods. Storefront checks cover desktop and 320px/390px mobile layouts.

Product pack images and prices can be adjusted through each SKU's existing product editor. To remove a base product, deactivate it or remove its linked options first; deletion now returns an actionable message instead of a database error.
