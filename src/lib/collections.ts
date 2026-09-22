// Public category labels and URLs mapped to administrator-managed categories.
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
  {
    slug: 'plant-based-milks',
    name: 'Plant-Based Milks',
    image: 'plant-based-milks.png',
    source: 'plant-based-milks',
    alt: 'Glass and carafe of plant-based milk with almonds and oats',
  },
] as const;

export function collectionImage(image: string) {
  return `/storefront/${image.includes('.') ? image : `${image}.webp`}`;
}
