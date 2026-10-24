import type { Metadata } from 'next';
import { COLLECTIONS, collectionImage } from '../collections';

export const HOME_TITLE = 'La Costa Gourmet — Café-quality drinks shipped to your door';
export const HOME_DESCRIPTION =
  'Shop chai, matcha, coffee, smoothies and café supplies from your favorite brands. La Costa Gourmet delivers to homes and businesses nationwide.';

const DEFAULT_IMAGE = {
  url: '/storefront/hero-hot-coffees.webp',
  alt: 'Hot latte, pumpkin spice latte and flat white from La Costa Gourmet',
};

type PageMetadata = {
  title: string;
  description: string;
  canonical: string;
  image?: { url: string; alt: string };
};

/** Keep search and social previews in step for every public landing page. */
export function pageMetadata({
  title,
  description,
  canonical,
  image = DEFAULT_IMAGE,
}: PageMetadata): Metadata {
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      siteName: 'La Costa Gourmet',
      title,
      description,
      url: canonical,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}

/** Avoid adding a second brand while preserving the actual product name. */
export function productTitle(name: string, brand?: string | null): string {
  const productName = name.trim();
  const brandName = brand?.trim();
  if (!brandName) return productName;

  const normalize = (value: string) => value
    .replace(/[™®]/g, '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('en-US');
  const normalizedName = normalize(productName);
  const normalizedBrand = normalize(brandName);
  const following = normalizedName.slice(normalizedBrand.length);
  const startsWithBrand = normalizedName.startsWith(normalizedBrand)
    && (!following || !/^[\p{L}\p{N}]/u.test(following));

  return startsWithBrand ? productName : `${brandName} — ${productName}`;
}

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  'chai-and-matcha': 'Explore chai, matcha and frappé mixes for hot, iced and blended drinks. Shop café favorites for your home or business at La Costa Gourmet.',
  smoothies: 'Shop smoothie mixes and refreshers for fruit-forward drinks at home or behind the counter. Find your next blend at La Costa Gourmet.',
  syrups: 'Shop flavored syrups and sauces for coffee, lattes and other café drinks. Discover flavors for your menu at La Costa Gourmet.',
  'protein-and-energy': 'Browse protein and energy drink mixes for shakes, smoothies and your café menu. Shop the selection at La Costa Gourmet.',
  oatmeal: 'Shop oatmeal for easy breakfasts at home, in the office or at your café. Browse flavors and pack sizes at La Costa Gourmet.',
  boba: 'Shop boba and bubble tea supplies for your home or café. Explore the selection and available pack sizes at La Costa Gourmet.',
  'specialty-beverages': 'Explore specialty beverages, including hot chocolate and cocoa mixes, for your home or café. Shop the selection at La Costa Gourmet.',
  'coffee-tea': 'Shop coffee and tea for your daily cup or café menu. Browse trusted brands and available pack sizes at La Costa Gourmet.',
  'plant-based-milks': 'Shop plant-based milks for coffee, lattes and everyday drinks. Explore dairy alternatives for your home or café at La Costa Gourmet.',
};

export function categoryMetadata(slug: string, name: string, canonical: string): Metadata {
  const collection = COLLECTIONS.find((item) => item.slug === slug || item.source === slug);
  const description = CATEGORY_DESCRIPTIONS[collection?.source ?? slug]
    ?? `Shop ${name} at La Costa Gourmet. Browse products, brands and pack sizes to find the right supplies for your home or business.`;

  return pageMetadata({
    title: name,
    description,
    canonical,
    image: collection
      ? { url: collectionImage(collection.image), alt: collection.alt }
      : undefined,
  });
}

export function brandMetadata(
  name: string,
  canonical: string,
  image?: { url: string; alt: string },
): Metadata {
  return pageMetadata({
    title: name,
    description: `Shop ${name} at La Costa Gourmet. Explore the available products and pack sizes for your home, café or business, with nationwide delivery.`,
    canonical,
    image,
  });
}
