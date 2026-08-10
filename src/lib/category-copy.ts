/**
 * One-sentence descriptions shown on each top-level category landing.
 * Grounded in real supplier data — supplier names accurate per the
 * Phase 2 catalog migration (brand-meta.ts).
 *
 * Keyed by categories.slug. Missing keys fall back to an empty string.
 *
 * Current top-level categories:
 *   syrups                     (new category, added Jul 2026)
 *   chai-and-matcha            (was chai-tea, renamed May 2026)
 *   specialty-beverages        (display name "Frappe & Cocoa & Coffee", was "Specialty Beverages & Frappes" until Aug 2026)
 *   smoothies                  (display name "Smoothies & Refreshers" since Aug 2026; was smoothie-bases)
 *   oatmeal                    (was oatmeal-and-grains)
 *   protein-and-energy         (renamed from protein-and-supplements)
 *   boba                       (new category, added Jul 2026)
 *
 * Display names live in the categories table and are edited in admin;
 * slugs are the stable keys here and in the Google feed taxonomy map —
 * never rename a slug without redirects.
 */

export const CATEGORY_COPY: Record<string, string> = {
  'syrups':
    'Flavored syrups and sauces for lattes, sodas, and blended drinks — new category, products landing soon.',
  'chai-and-matcha':
    'The chai concentrates, matcha lattes, and loose teas our café customers reorder every six weeks.',
  'specialty-beverages':
    'Cocoa powders, frappé mixes, and café coffee bases — forty-plus blended-drink mixes from Big Train, Mocafe, Torani, and Monin.',
  'smoothies':
    'Fruit purees and smoothie bases from Dr. Smoothie and Sunny Sky.',
  'oatmeal':
    'Steel-cut oats and single-serve cups from Modern Oats.',
  'protein-and-energy':
    'Protein powders and energy drinks — new category, products landing soon.',
  'boba':
    'Tapioca pearls, popping boba, and milk-tea bases — new category, products landing soon.',
};

export function categoryCopy(slug: string): string {
  return CATEGORY_COPY[slug] ?? '';
}
