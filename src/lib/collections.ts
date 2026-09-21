import membership from './collection-membership.json';
import sources from './collection-sources.json';

// Approved merchandising groups, layered over the existing database categories.
// Inventory, prices and stock always come from Supabase.
export const COLLECTIONS = [
  {
    slug: 'chai-matcha',
    name: 'Chai, Matcha & Frappés',
    image: 'chai-matcha',
    source: 'chai-and-matcha',
    alt: 'Iced matcha latte',
  },
  {
    slug: 'smoothies',
    name: 'Smoothies & Refreshers',
    image: 'smoothies-pineapple',
    source: 'smoothies',
    alt: 'Pineapple smoothie with a fresh pineapple wedge',
  },
  {
    slug: 'syrups',
    name: 'Syrups & Sauces',
    image: 'syrups',
    source: 'syrups',
    alt: 'Iced caramel latte',
  },
  {
    slug: 'protein',
    name: 'Protein & Energy',
    image: 'protein',
    source: 'protein-and-energy',
    alt: 'Chocolate protein shake',
  },
  {
    slug: 'oatmeal',
    name: 'Oatmeal',
    image: 'oatmeal-fruit-nuts',
    source: 'oatmeal',
    alt: 'Oatmeal topped with fresh fruit and nuts',
  },
  {
    slug: 'boba',
    name: 'Boba',
    image: 'boba',
    source: 'boba',
    alt: 'Clear glass of milk tea with boba pearls at the bottom',
  },
  {
    slug: 'cocoa',
    name: 'Hot Chocolate',
    image: 'cocoa',
    source: 'specialty-beverages',
    alt: 'Cup of hot chocolate',
  },
  {
    slug: 'coffee',
    name: 'Coffee & Tea',
    image: 'coffee',
    source: 'coffee-tea',
    alt: 'Glass mug of freshly brewed coffee',
  },
] as const;

export function collectionMembership(
  product: { slug: string; name: string },
  sourceSlugs: string[],
): string[] {
  const curated = (membership as Record<string, string[]>)[product.slug];
  const groups = COLLECTIONS.filter(
    (c) => c.source !== 'specialty-beverages' && sourceSlugs.includes(c.source),
  ).map((c) => c.slug as string);
  const originalCategory = (sources as Record<string, string[]>)[product.slug];
  // A product moved by an administrator follows its new category; adding an
  // extra category also works for products already in the approved selection.
  if (curated && originalCategory?.some((slug) => sourceSlugs.includes(slug)))
    return [...new Set([...curated, ...groups])];
  // Newly added products inherit the administrator's category assignments.
  if (sourceSlugs.includes('specialty-beverages')) {
    if (/frapp[eé]|blended|chai|matcha|horchata/i.test(product.name))
      groups.push('chai-matcha');
    if (
      /cocoa|hot chocolate|drinking chocolate|ground chocolate|chocolate (powder|mix)/i.test(
        product.name,
      )
    )
      groups.push('cocoa');
    if (
      /coffee|espresso|tea\b|mocha|latte|oat\s?milk|barista.*milk/i.test(
        product.name,
      )
    )
      groups.push('coffee');
  }
  if (sourceSlugs.includes('specialty-beverages')) {
    if (
      /smoothie|refresher|puree|lemonade|soda|tiki breeze/i.test(product.name)
    )
      groups.push('smoothies');
    if (/syrup|sauce|pump/i.test(product.name)) groups.push('syrups');
    if (/protein|energy|lotus plant/i.test(product.name))
      groups.push('protein');
    if (/boba|tapioca/i.test(product.name)) groups.push('boba');
  }
  return [...new Set(groups)];
}
