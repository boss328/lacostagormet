/**
 * One-sentence descriptions shown on each top-level category landing.
 * Grounded in real supplier data — supplier names accurate per the
 * Phase 2 catalog migration (brand-meta.ts).
 *
 * Keyed by categories.slug. Missing keys fall back to an empty string.
 *
 * Current top-level categories:
 *   chai-and-matcha            (was chai-tea, renamed May 2026)
 *   specialty-beverages        (display name "Specialty Beverages & Frappes" — merged cocoa + frappés + syrups-and-sauces)
 *   smoothies                  (was smoothie-bases)
 *   oatmeal                    (was oatmeal-and-grains)
 *   protein-and-energy         (renamed from protein-and-supplements)
 */

export const CATEGORY_COPY: Record<string, string> = {
  'chai-and-matcha':
    'The chai concentrates, matcha lattes, and loose teas our café customers reorder every six weeks.',
  'specialty-beverages':
    'Cocoa powders, frappé mixes, and flavored syrups — forty-plus blended-drink bases from Big Train, Mocafe, Torani, and Monin.',
  'smoothies':
    'Fruit purees and smoothie bases from Dr. Smoothie and Sunny Sky.',
  'oatmeal':
    'Steel-cut oats and single-serve cups from Modern Oats.',
  'protein-and-energy':
    'Protein powders and energy drinks — new category, products landing soon.',
};

export function categoryCopy(slug: string): string {
  return CATEGORY_COPY[slug] ?? '';
}
