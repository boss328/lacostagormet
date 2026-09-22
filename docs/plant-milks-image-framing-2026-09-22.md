# Plant-based milks and product image framing

## Storefront and catalog

- Added Plant-Based Milks to the homepage, category menu, filters and footer.
- Added six existing milk products to the new category while retaining Coffee & Tea and all original assignments: SKUs 29252, USMK-01032006, 00660, 00661, USMK-02032006 and 04320.
- Admin product editing now has an **Also show in** category selector. Older clients that omit this field preserve additional memberships when saving. Creating a product still uses its primary category; additional categories can be selected when editing it.
- `scripts/add-plant-based-milks.ts ENV_FILE --check|--apply` is an idempotent, explicitly scoped catalog operation. No database schema, authentication, pricing or checkout changes.

## Product photos

The shared ProductImage component uses square white frames across cards, galleries, cart and order details. Read-only pixel analysis records existing source dimensions and conservative content bounds in `src/lib/product-image-frames.json`. The longest content dimension occupies 82% of the square and stays centered. Original photos, packaging, labels and URLs remain intact.

Analysis covers all 440 unique images across the 240 active products present on September 22. Near-white or transparent borders can be discounted; other backgrounds retain the entire image. Unknown future URLs safely use object-fit contain. Re-run `scripts/check-catalog.ts` then `scripts/analyze-product-image-framing.ts` to refresh bounds for newly added photos, review, and redeploy. The analysis script caches unmodified originals in `/tmp/lcg-original-product-images` and does not write to storage.

The image uploader now recommends **1200 × 1200 pixels, a white background, a centered product with about 10% space around it, JPG or WebP, ideally under 500 KB**. Future uploads prepared this way need no individual framing record. Existing upload limits remain unchanged.

## Category artwork

Generated using the built-in image-generation tool; no API fallback. Output: `public/storefront/plant-based-milks.png`. This is editorial category artwork, separate from the unmodified product photos.

Prompt brief: Premium square editorial product photography for a gourmet plant-based milk category. A glass of oat milk and clear glass carafe on a warm white surface, a restrained arrangement of almonds and oats, natural window light, soft shadows, generous margins, refined and realistic. No text, logos, branded packaging or cartons. Fit a restrained gourmet storefront using green and purple accents.

## Validation

- Catalog filter parity: all nine categories, including six plant milks; 1,400 filter combinations.
- Regression tests cover image proportions, centered content, safe fallback, bounds for every recorded image and additional-category preservation.
- Browser review: desktop catalog, 390px mobile catalog and product gallery, homepage/menu, and admin editing guidance.
- Production build, TypeScript and lint passed; 27 regression tests passed.
