# Category and product-detail cleanup

Homepage categories now use their corresponding live admin category, including primary assignments, additional assignments, and descendants. The old merchandising snapshots and keyword classification have been removed. Changing a product's category in admin takes effect on the next storefront request.

The live catalog was checked on September 21, 2026: 238 products, 24 brands, and 1,300 category/brand/sort combinations. Category counts after reconciliation: Chai 94, Smoothies 34, Syrups 35, Protein 30, Oatmeal 8, Boba 7, Hot Chocolate 10, Coffee & Tea 20. These counts can change when the catalog is edited.

## Product data repair

- Filled 152 empty `products.pack_size` values from explicit packaging in product names. Smartfruit Strawberry Bananza's missing bottle size came from its existing description.
- Pump dose and compatible bottle capacity were excluded from package volume. Accessories use their unit count; the two matcha products without a stated weight use the confirmed `1 bag` packaging.
- Preserved existing pack-size fields, prices, category assignments, and product URLs.
- Added the missing Earl Grey photo to the existing `product-images` storage bucket and `product_images` table. Photo source: [Two Leaves and a Bud wholesale product page](https://wholesale.twoleavestea.com/product/organic-earl-grey-tea), its official Earl Grey sachet photo. No image was generated or altered.
- Verified through the public catalog that all 238 active products have a pack size and at least one image after repair.

The maintenance commands accept a local environment file; never commit credentials:

```sh
pnpm exec tsx scripts/backfill-pack-sizes.ts ENV_FILE --plan PLAN_FILE
# Review all before/after values and their evidence, then:
pnpm exec tsx scripts/backfill-pack-sizes.ts ENV_FILE --apply PLAN_FILE
pnpm exec tsx scripts/restore-earl-grey-image.ts ENV_FILE --check
pnpm exec tsx scripts/restore-earl-grey-image.ts ENV_FILE --apply
```

Keep the plan file as the before/after backup. Applying it checks the current product name and pack size before each update and preserves concurrent admin edits. Re-running skips already-applied values. The image command preserves any image already assigned to Earl Grey.

Validation:

```sh
pnpm exec tsx --test src/lib/catalog-filter.test.ts scripts/lib/infer-pack-size.test.ts
pnpm exec tsx scripts/check-catalog.ts
pnpm build
```
