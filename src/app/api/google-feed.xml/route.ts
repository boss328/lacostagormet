import { createStaticClient } from '@/lib/supabase/static';
import {
  validGtin,
  googleAvailability,
  plainTextDescription,
  sortProductImages,
} from '@/lib/seo/product-schema';

/**
 * Google Merchant Center product feed — RSS 2.0 with the g: namespace.
 *
 * Serves at /api/google-feed.xml (robots.ts allows this one path under
 * the /api disallow). Merchant Center account 114462761 pulls it via
 * Settings → Data sources → Add product source → scheduled fetch,
 * daily. The stale manual GoogleBaseFeed.xml source should be deleted
 * when the scheduled one is added, or the two will fight over item IDs.
 *
 * Anon client + RLS (same as sitemap.ts): the feed ships exactly the
 * public catalog, and the service-role key stays out of a public route.
 * noStore keeps the reads out of Vercel's Data Cache; the CDN caches
 * the response for an hour via s-maxage instead, which is fresh enough
 * for a once-daily fetch without hitting Supabase per request.
 */

const SITE = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lacostagourmet.com'
).replace(/\/$/, '');

export const dynamic = 'force-dynamic';

/**
 * Live category slug → Google taxonomy ID (2021 list:
 * google.com/basepages/producttype/taxonomy-with-ids.en-US.txt).
 * Keyed on slug, not name — names get reworded in admin. Unmapped or
 * missing categories fall back to Powdered Beverage Mixes; Merchant
 * Center flags any ID it dislikes on the first fetch.
 */
const GOOGLE_CATEGORY: Record<string, string> = {
  'syrups':               '5723',   // Condiments & Sauces > Syrup
  'chai-and-matcha':      '2073',   // Beverages > Tea & Infusions
  'specialty-beverages':  '499676', // Beverages > Powdered Beverage Mixes
  'smoothies':            '499676',
  'oatmeal':              '5729',   // Food Items > Grains, Rice & Cereal
  'protein-and-energy':   '2984',   // Nutritional Supplements
  'boba':                 '499676',
};
const DEFAULT_GOOGLE_CATEGORY = '499676';

const FEED_SELECT = `
  sku, name, slug, description, short_description, retail_price, upc,
  weight_lb, stock_status,
  brands(name),
  primary_category:categories!primary_category_id(name, slug),
  product_images(url, is_primary, display_order)
`;

type FeedRow = {
  sku: string;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  retail_price: number | string;
  upc: string | null;
  weight_lb: number | string | null;
  stock_status: string | null;
  brands: { name: string } | null;
  primary_category: { name: string; slug: string } | null;
  product_images: Array<{
    url: string;
    is_primary: boolean;
    display_order: number;
  }> | null;
};

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // control chars break XML parsers
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

/** Google caps titles at 150 chars — trim on a word boundary. */
function trimTitle(raw: string, limit = 150): string {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (t.length <= limit) return t;
  const cut = t.slice(0, limit);
  return cut.slice(0, cut.lastIndexOf(' ')).trim();
}

export async function GET() {
  const supabase = createStaticClient({ noStore: true });

  // Page through like sitemap.ts — the catalog sits under the default
  // 1000-row limit today, but don't let growth silently truncate the feed.
  const rows: FeedRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('products')
      .select(FEED_SELECT)
      .eq('is_active', true)
      .is('deleted_at', null)
      .range(from, from + pageSize - 1);
    if (error) {
      return new Response(`<!-- feed error: ${esc(error.message)} -->`, {
        status: 500,
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      });
    }
    const page = (data ?? []) as unknown as FeedRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  const items: string[] = [];
  const skipped: string[] = [];

  for (const row of rows) {
    const price = Number(row.retail_price);
    const images = sortProductImages(row.product_images);

    // Google rejects items missing any of these — skip rather than
    // send a broken item. Skips are listed in the comment up top.
    if (!row.sku || !row.name || !row.slug || images.length === 0 || !(price > 0)) {
      skipped.push(row.sku ?? row.name ?? '(unknown)');
      continue;
    }

    const brand = row.brands?.name ?? 'La Costa Gourmet';
    const bareName = row.name.replace(/\s+/g, ' ').trim();
    // Most catalog names already lead with the brand — don't double it.
    const title = trimTitle(
      bareName.toLowerCase().startsWith(brand.toLowerCase())
        ? bareName
        : `${brand} ${bareName}`,
    );
    const description = (
      plainTextDescription(row.description) ||
      plainTextDescription(row.short_description) ||
      bareName
    ).slice(0, 5000);
    const gtin = validGtin(row.upc);
    const categorySlug = row.primary_category?.slug ?? '';

    const parts: string[] = [
      `<g:id>${esc(row.sku)}</g:id>`,
      `<g:title>${esc(title)}</g:title>`,
      `<g:description>${esc(description)}</g:description>`,
      `<g:link>${esc(`${SITE}/product/${row.slug}/`)}</g:link>`,
      `<g:image_link>${esc(images[0].url)}</g:image_link>`,
      ...images
        .slice(1, 11)
        .map((i) => `<g:additional_image_link>${esc(i.url)}</g:additional_image_link>`),
      `<g:availability>${googleAvailability(row.stock_status)}</g:availability>`,
      `<g:price>${price.toFixed(2)} USD</g:price>`,
      `<g:condition>new</g:condition>`,
      `<g:brand>${esc(brand)}</g:brand>`,
      `<g:google_product_category>${
        GOOGLE_CATEGORY[categorySlug] ?? DEFAULT_GOOGLE_CATEGORY
      }</g:google_product_category>`,
    ];

    if (row.primary_category) {
      parts.push(`<g:product_type>${esc(row.primary_category.name)}</g:product_type>`);
    }

    // Prefer a real GTIN; a missing or malformed UPC downgrades to
    // mpn + identifier_exists=no instead of failing the item.
    parts.push(`<g:mpn>${esc(row.sku)}</g:mpn>`);
    if (gtin) {
      parts.push(`<g:gtin>${gtin}</g:gtin>`);
    } else {
      parts.push(`<g:identifier_exists>no</g:identifier_exists>`);
    }

    const weight = Number(row.weight_lb);
    if (weight > 0) {
      parts.push(`<g:shipping_weight>${weight} lb</g:shipping_weight>`);
    }

    items.push(`  <item>\n    ${parts.join('\n    ')}\n  </item>`);
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n` +
    `<channel>\n` +
    `  <title>La Costa Gourmet</title>\n` +
    `  <link>${SITE}</link>\n` +
    `  <description>Cafe-quality beverage supplies shipped nationwide from Carlsbad, California.</description>\n` +
    `  <!-- generated ${new Date().toISOString()} | ${items.length} items` +
    (skipped.length ? ` | ${skipped.length} skipped: ${esc(skipped.join(', '))}` : '') +
    ` -->\n` +
    items.join('\n') +
    `\n</channel>\n</rss>\n`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
