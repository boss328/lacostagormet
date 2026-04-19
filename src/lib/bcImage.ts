/**
 * BigCommerce CDN only serves pre-generated variants — verified universally
 * available: 350, 500, 1280. DB stores the 1280.1280 variant as canonical;
 * this helper downsizes at render time.
 *
 *   card → 350 × 350   (grid thumbnails)
 *   mid  → 500 × 500   (cart line items, compact lists)
 *   hero → 1280 × 1280 (product detail main image, full-bleed)
 *
 * If the URL doesn't look like a BC sized URL, returns it untouched.
 */

type BcImageSize = 'card' | 'mid' | 'hero';

const DIMS: Record<BcImageSize, number> = {
  card: 350,
  mid: 500,
  hero: 1280,
};

const SIZE_SEGMENT = /\.(\d+)\.(\d+)\.(jpg|jpeg|png|webp|gif)(\?|$)/i;

export function bcImage(url: string, size: BcImageSize): string {
  if (!url) return url;
  const d = DIMS[size];
  return url.replace(SIZE_SEGMENT, `.${d}.${d}.$3$4`);
}
