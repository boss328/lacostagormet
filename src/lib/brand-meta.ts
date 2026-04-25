/**
 * Per-brand typology labels — the category fit of what each brand actually
 * ships in our catalog. Rendered in the BrandRow meta row (left side).
 *
 * This is observed-from-data labelling, not invented fact. If Jeff wants to
 * edit any of these (e.g., "FRAPPÉ · CHAI · CAFÉ" → "SPECIALTY CHAI"), this
 * is the one place to change it.
 *
 * Keyed by brand.slug. Unknown slugs fall back to an empty string (row renders
 * only item count on the right).
 */

export const BRAND_TYPOLOGY: Record<string, string> = {
  'big-train':           'Frappé · Chai',
  'cafe-essentials':     'Frappé · Chai · Cocoa',
  'david-rio':           'Gourmet Chai',
  'davinci-gourmet':     'Syrups · Sauces',
  'dr-smoothie':         'Chai · Refreshers',
  'lotus-plant-power':   'Energy · Plant-Based',
  'mocafe':              'Chai · Matcha · Cocoa',
  'modern-oats':         'Oatmeal',
  'monin':               'Syrups · Sauces',
  'mylk-labs':           'Oatmeal',
  'oregon-chai':         'Chai',
  'smartfruit':          'Purees · Refreshers',
  'sunny-sky-products':  'Syrups · Sauces',
  'tiki-breeze':         'Energy · Syrups · Smoothies',
  'torani':              'Syrups · Sauces',
  'upouria':             'Syrups · Sauces',
};

export function brandTypology(slug: string): string {
  return BRAND_TYPOLOGY[slug] ?? '';
}

/**
 * Brands whose product catalog is empty by design — show "Coming soon"
 * on /brand tiles instead of "0 items". Update when the owner ships
 * real SKUs for any of these labels.
 */
export const BRAND_COMING_SOON: ReadonlySet<string> = new Set([
  'modern-oats',
  'smartfruit',
  'torani',
  'tiki-breeze',
  'lotus-plant-power',
]);

export function isBrandComingSoon(slug: string): boolean {
  return BRAND_COMING_SOON.has(slug);
}
