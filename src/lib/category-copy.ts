/**
 * One-sentence descriptions shown on each top-level category landing.
 * Grounded in real supplier data — supplier names are accurate per the Phase 2
 * catalog migration (brand-meta.ts).
 *
 * Keyed by categories.slug. Missing keys fall back to an empty string.
 */

export const CATEGORY_COPY: Record<string, string> = {
  'teas-and-chai':
    'The chai concentrates, matcha lattes, and loose teas our café customers reorder every six weeks.',
  'cocoa':
    'Rich, single-origin cocoa powders and spiced Mexican blends — pantry-stable, café-grade.',
  'frappes':
    'The blended-drink bases that built our business. Forty-plus SKUs, one supplier, twenty-two years.',
  'oatmeal-and-grains':
    'Steel-cut oats and single-serve cups from Modern Oats and Mylk Labs.',
  'smoothie-bases':
    'Fruit purees and smoothie mixes from Dr. Smoothie and Sunny Sky.',
  'syrups-and-sauces':
    'Flavored syrups from Torani and Monin, gourmet sauces by the bottle or case.',
};

export function categoryCopy(slug: string): string {
  return CATEGORY_COPY[slug] ?? '';
}
