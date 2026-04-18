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
  'big-train':           'Frappé · Chai · Café',
  'cafe-essentials':     'Café Bases',
  'david-rio':           'Chai · Specialty Tea',
  'davinci-gourmet':     'Syrups · Sauces',
  'dr-smoothie':         'Smoothie Bases',
  'mocafe':              'Cocoa · Frappé',
  'modern-oats':         'Oatmeal',
  'monin':               'Syrups · Sauces',
  'mylk-labs':           'Oatmeal',
  'oregon-chai':         'Chai',
  'smartfruit':          'Smoothie Bases',
  'sunny-sky-products':  'Smoothie · Fruit',
  'torani':              'Syrups · Sauces',
  'upouria':             'Cocoa · Drink Mixes',
};

export function brandTypology(slug: string): string {
  return BRAND_TYPOLOGY[slug] ?? '';
}
