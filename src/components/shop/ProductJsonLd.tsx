import {
  validGtin,
  googleAvailability,
  plainTextDescription,
  sortProductImages,
} from '@/lib/seo/product-schema';
import { calculateShipping } from '@/lib/checkout/shipping';

/**
 * schema.org Product JSON-LD for the product detail page.
 *
 * Reads the same row the page already fetched and the same helpers the
 * Merchant Center feed uses, so the crawled page and the feed can't
 * disagree — a price/availability mismatch between the two is what gets
 * items disapproved. Renders nothing when a required field is missing:
 * partial markup is worse than none, because Google trusts it and then
 * finds it contradicted.
 */

const SITE = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lacostagourmet.com'
).replace(/\/$/, '');

/** Structural subset of the page's ProductRow — pass the row straight through. */
export type JsonLdProduct = {
  sku: string;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  retail_price: number | string;
  upc: string | null;
  weight_lb: number | string | null;
  stock_status?: string | null;
  brands: { name: string } | null;
  primary_category?: { name: string } | null;
  product_images: Array<{
    url: string;
    is_primary: boolean;
    display_order: number;
  }> | null;
};

export function ProductJsonLd({ product }: { product: JsonLdProduct }) {
  const price = Number(product.retail_price);
  if (!product.sku || !product.name || !product.slug || !(price > 0)) {
    return null;
  }

  const brand = product.brands?.name ?? 'La Costa Gourmet';
  const gtin = validGtin(product.upc);
  const images = sortProductImages(product.product_images).map((i) => i.url);
  const url = `${SITE}/product/${product.slug}/`;
  const description =
    plainTextDescription(product.description) ||
    plainTextDescription(product.short_description);

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name.replace(/\s+/g, ' ').trim(),
    sku: product.sku,
    mpn: product.sku,
    brand: { '@type': 'Brand', name: brand },
    url,
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'USD',
      price: price.toFixed(2),
      itemCondition: 'https://schema.org/NewCondition',
      availability:
        googleAvailability(product.stock_status) === 'out_of_stock'
          ? 'https://schema.org/OutOfStock'
          : 'https://schema.org/InStock',
      seller: { '@type': 'Organization', name: 'La Costa Gourmet' },
      priceValidUntil: new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10),

      // Search Console flags "Missing field hasMerchantReturnPolicy"
      // without this. Values mirror /returns/ and the Merchant Center
      // policy: 30 days, by mail, customer pays return shipping, US only.
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'US',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: 30,
        returnMethod: 'https://schema.org/ReturnByMail',
        returnFees: 'https://schema.org/ReturnShippingFees',
      },

      // Google pairs this with the return policy for full merchant-listing
      // treatment. The rate comes from the same calculateShipping the cart
      // uses (single-item order of this product), so markup and checkout
      // cannot drift. Handling 3–5 + transit 2–5 days = the 5–10 day
      // total published in Merchant Center; keep those two in sync.
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingRate: {
          '@type': 'MonetaryAmount',
          value: calculateShipping(price).toFixed(2),
          currency: 'USD',
        },
        shippingDestination: {
          '@type': 'DefinedRegion',
          addressCountry: 'US',
        },
        deliveryTime: {
          '@type': 'ShippingDeliveryTime',
          handlingTime: { '@type': 'QuantitativeValue', minValue: 3, maxValue: 5, unitCode: 'DAY' },
          transitTime: { '@type': 'QuantitativeValue', minValue: 2, maxValue: 5, unitCode: 'DAY' },
        },
      },
    },
  };

  if (images.length) data.image = images;
  if (description) data.description = description.slice(0, 5000);
  if (product.primary_category?.name) data.category = product.primary_category.name;
  // schema.org distinguishes gtin length variants; pick the right one.
  if (gtin) data[`gtin${gtin.length}`] = gtin;

  const weight = Number(product.weight_lb);
  if (weight > 0) {
    data.weight = { '@type': 'QuantitativeValue', value: weight, unitCode: 'LBR' };
  }

  return (
    <script
      type="application/ld+json"
      // Escaping "<" keeps a stray "</script>" inside a description from
      // breaking out of the tag.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  );
}
