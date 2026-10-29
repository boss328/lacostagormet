# Monin Beverage Boost additions

Jeff's email **3 New Monin Products**, October 28, 2026, message `1a185c564be4a437`, approves three single bottles at **$27 each** and a mixed three-pack at **$84** containing one of each. It does not provide opening stock quantities, packaged shipping weights, a fulfillment location for the new packs, or pump inclusion.

The existing `M-FX325FP`, `M-FX356FP`, and `M-FX326FP` products are four-bottle cases priced at $99.95. Keep those case identities and prices intact. Add the singles as linked pack options, using separate SKUs, and keep the mixed pack as its own product family.

| New SKU | Name | Contents | Price | Existing parent SKU |
| --- | --- | --- | ---: | --- |
| M-FX325FP-1 | Monin Total Immunity Boost — One 1 Liter Bottle | 1 × 1 L bottle | $27 | M-FX325FP |
| M-FX356FP-1 | Monin Hydration Boost — One 1 Liter Bottle | 1 × 1 L bottle | $27 | M-FX356FP |
| M-FX326FP-1 | Monin Energy Boost — One 1 Liter Bottle | 1 × 1 L bottle | $27 | M-FX326FP |
| M-BOOST-MIX3 | Monin Beverage Boosts — Mixed 3-Pack | 3 × 1 L bottles, one of each above | $84 | None |

The new SKU suffixes and mixed SKU are internal catalog identifiers, not manufacturer-provided codes. Check for conflicts before creating them. Set the existing base packs to 4 units with the singular unit label `bottle`; each linked single uses 1 unit. The mixed pack uses 3 units and `bottle`.

## Product descriptions

**Total Immunity Boost:** One 1 liter bottle of Monin Total Immunity Boost, a beverage concentrate with vitamins C, D and B3, zinc, and elderberry. Mix into coffee, tea, lemonade, smoothies, or still or sparkling water. This listing contains one bottle.

**Hydration Boost:** One 1 liter bottle of Monin Hydration Boost, a liquid electrolyte concentrate with magnesium, potassium, and sodium. Made without added sugar or sweeteners, it mixes into hot or cold beverages. This listing contains one bottle.

**Energy Boost:** One 1 liter bottle of Monin Energy Boost, a caffeinated beverage concentrate with plant extracts. Mix into iced tea, lemonade, smoothies, or still or sparkling water. Contains caffeine. This listing contains one bottle.

**Mixed three-pack:** Three 1 liter bottles of Monin Beverage Boosts: one Total Immunity Boost, one Hydration Boost, and one Energy Boost. Try each concentrate in your favorite drinks. The Energy Boost bottle contains caffeine. This listing contains three bottles, one of each variety.

Descriptions deliberately omit medical efficacy promises, manufacturer direct-store promotional offers, and a promise of a pump. Jeff's case product names mention one pump, but this does not establish pump inclusion with a single bottle or mixed pack. The $84 mixed pack costs $3 more than three $27 singles; do not label it a discount or show a savings claim.

## Photos and launch requirements

Use the existing genuine front bottle photograph when it matches the single. A source image's filename may refer to a case while its pixels show only one bottle, so inspect it before choosing. A mixed-pack main photo should show one of each of the three products; do not use a one-flavor case photo as the mixed-pack main image.

Keep new records hidden and unavailable until their actual stock, fulfillment, and packaged weights are supplied. Do not copy full-case weights onto singles, derive shipment weights from fluid contents, copy case UPCs, or infer the new packs' inventory from supplier availability.

Inventory is independent per SKU. Creating the mixed SKU does not make it draw one unit from each single SKU. Until component inventory is implemented, only track separately assembled mixed packs: stock allocated to the mixed packs must not also remain available as singles.

## Catalog setup

The four drafts were created on October 29 with `scripts/sql/add-monin-boost-drafts.sql`, after a rollback-only check. That one-time script rejects reruns. IDs and approved content are recorded in `monin-boost-catalog.json`. All four are hidden and out of stock, without opening quantities, packaged weights or fulfillment assignments. Existing case prices, stock, shipping details and SKUs were preserved; only their pack count and label were configured for the linked singles.

The original manufacturer bottle images and the mixed-pack composition are saved in `public/products/monin-boosts/` and uploaded to `product-images/monin-boosts-20261029/`. The mixed image includes generated-media metadata; its prompt and source images are documented in `monin-boost-image.json`.

An authorized reply was sent in Jeff's original email thread on October 29 requesting counts, packaged weights, shipping location, pump inclusion and whether mixed packs use separately allocated stock. No launch details were inferred from case weights or prices.

## Manufacturer evidence

Checked October 29, 2026:

- [Total Immunity Boost](https://monin.us/products/total-immunity-boost): 1 liter bottle and four-bottle case formats; vitamins C, D and B3, zinc and elderberry; beverage uses.
- [Hydration Boost](https://monin.us/products/hydration-boost): 1 liter bottle and four-bottle case formats; magnesium, potassium and sodium; no added sugar or sweeteners; hot and cold beverage uses.
- [Energy Boost](https://monin.us/products/energy-boost): 1 liter bottle and four-bottle case formats; natural caffeine and plant extracts. The manufacturer states 28 mg caffeine per quarter fluid ounce.
- [Manufacturer product list, February 2024](https://apps.monin.com/storage/app/media/Flavor%20Lists/P501%20Flavor%20List%202.23.24.pdf): confirms the three manufacturer codes under 1 liter / four per case. Its pump note applies to cases.

Official image fallbacks, to inspect against the actual stock before use:

- [Total Immunity Boost bottle](https://monin.us/cdn/shop/files/1L-TotalImmunityBoost.png?v=1739202528&width=416)
- [Hydration Boost bottle](https://monin.us/cdn/shop/files/1L-HydrationBoost.png?v=1755203019&width=416)
- [Energy Boost bottle](https://monin.us/cdn/shop/files/1L-Energy_Boost_2048x2048_319d6700-c0ff-49fe-a765-1e3afb7ad82c.png?v=1785329658&width=416)

The current Energy Boost manufacturer image may show updated packaging. Prefer the matching product photo Jeff supplied over replacing it solely because a manufacturer asset is newer.
