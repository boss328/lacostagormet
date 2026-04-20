import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { Reveal } from '@/components/design-system/Reveal';
import { SectionHead } from '@/components/design-system/SectionHead';
import { ProductCard, type ProductCardData } from '@/components/shop/ProductCard';
import { ProductGallery, type GalleryImage } from '@/components/shop/ProductGallery';
import { ProductAddPanel } from '@/components/shop/ProductAddPanel';
import { ProductDescription } from '@/components/shop/ProductDescription';
import { bcImage } from '@/lib/bcImage';
import { formatPackSize } from '@/lib/pack-size';

type Params = { slug: string };

type ProductRow = {
  id: string;
  slug: string;
  sku: string;
  name: string;
  description: string | null;
  short_description: string | null;
  pack_size: string | null;
  units_per_pack: number | null;
  weight_lb: number | string | null;
  retail_price: number | string;
  brand_id: string | null;
  primary_category_id: string | null;
  brands: { id: string; name: string; slug: string } | null;
  primary_category: { id: string; name: string; slug: string } | null;
  product_images: Array<{
    url: string;
    alt_text: string | null;
    is_primary: boolean;
    display_order: number;
  }> | null;
  product_categories: Array<{
    categories: { id: string; name: string; slug: string } | null;
  }> | null;
};

const PRODUCT_SELECT = `
  id, slug, sku, name, description, short_description, pack_size, units_per_pack,
  weight_lb, retail_price, brand_id, primary_category_id,
  brands(id, name, slug),
  primary_category:categories!primary_category_id(id, name, slug),
  product_images(url, alt_text, is_primary, display_order),
  product_categories(categories(id, name, slug))
`;

async function fetchProduct(slug: string): Promise<ProductRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error(`product fetch: ${error.message}`);
  return data as unknown as ProductRow | null;
}

async function fetchRelated(product: ProductRow): Promise<ProductCardData[]> {
  const supabase = createClient();
  const baseSelect =
    'id, slug, sku, name, pack_size, retail_price, brands(name, slug), product_images(url, alt_text, is_primary, display_order)';

  if (product.brand_id) {
    const { data } = await supabase
      .from('products')
      .select(baseSelect)
      .eq('is_active', true)
      .eq('brand_id', product.brand_id)
      .neq('id', product.id)
      .limit(4);
    if (data && data.length >= 3) return data as unknown as ProductCardData[];
  }

  if (product.primary_category_id) {
    const { data } = await supabase
      .from('products')
      .select(`${baseSelect}, product_categories!inner(category_id)`)
      .eq('is_active', true)
      .eq('product_categories.category_id', product.primary_category_id)
      .neq('id', product.id)
      .limit(4);
    if (data) return data as unknown as ProductCardData[];
  }

  return [];
}

function sortImages(
  raw: ProductRow['product_images'],
): GalleryImage[] {
  if (!raw || raw.length === 0) return [];
  return [...raw]
    .sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      return a.display_order - b.display_order;
    })
    .map((i) => ({ url: i.url, alt_text: i.alt_text }));
}

function splitPrice(v: number | string): { dollars: string; cents: string } {
  const n = typeof v === 'string' ? Number(v) : v;
  const [d, c = '00'] = n.toFixed(2).split('.');
  return { dollars: d, cents: c.padEnd(2, '0').slice(0, 2) };
}

const PACK_SUFFIX_WORDS = new Set([
  // Vessels
  'bag', 'bags', 'can', 'cans', 'canister', 'canisters', 'bottle', 'bottles',
  'pouch', 'pouches', 'container', 'containers', 'carton', 'cartons',
  'jug', 'jugs', 'pack', 'packs', 'box', 'boxes', 'cup', 'cups',
  'case', 'cases', 'of',
  // Units
  'lb', 'lbs', 'oz', 'ozs', 'kg', 'g', 'ct', 'count',
  // Count words
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve',
]);

/**
 * Picks the italic-accent word for the product headline. Walks tokens
 * right-to-left, skipping pack-size tokens (counts, units, vessel names,
 * and bare numbers), and italicises the first substantive word found.
 */
function renderProductName(name: string) {
  const tokens = name.trim().split(/\s+/);
  if (tokens.length === 1) {
    return <em className="type-accent">{name}</em>;
  }
  let accentIdx = tokens.length - 1;
  for (let i = tokens.length - 1; i >= 1; i--) {
    const raw = tokens[i];
    const letters = raw.toLowerCase().replace(/[^a-z]/g, '');
    const isNumeric = /^[\d.,]+$/.test(raw);
    const isPackWord = letters.length > 0 && PACK_SUFFIX_WORDS.has(letters);
    if (!isNumeric && !isPackWord) {
      accentIdx = i;
      break;
    }
  }
  const before = tokens.slice(0, accentIdx).join(' ');
  const after = tokens.slice(accentIdx + 1).join(' ');
  return (
    <>
      {before && <>{before} </>}
      <em className="type-accent">{tokens[accentIdx]}</em>
      {after && <> {after}</>}
    </>
  );
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const product = await fetchProduct(params.slug);
  if (!product) return { title: 'Product not found' };
  const title = product.brands?.name
    ? `${product.brands.name} — ${product.name}`
    : product.name;
  const description =
    product.short_description ??
    `${product.name} from La Costa Gourmet. Bulk café supplies shipped from Carlsbad since 2003.`;
  return { title, description };
}

export default async function ProductPage({ params }: { params: Params }) {
  const product = await fetchProduct(params.slug);
  if (!product) notFound();

  const [related] = await Promise.all([fetchRelated(product)]);

  const gallery = sortImages(product.product_images);
  const primary = gallery[0] ?? null;
  const brandName = product.brands?.name ?? null;
  const { dollars, cents } = splitPrice(product.retail_price);
  const pack = formatPackSize(product.pack_size);
  const weight = product.weight_lb
    ? `${Number(product.weight_lb).toFixed(2).replace(/\.00$/, '')} lb`
    : null;

  // Tag row — unique categories, excluding the primary (it's in the breadcrumb)
  const tagSet = new Map<string, { id: string; name: string; slug: string }>();
  for (const row of product.product_categories ?? []) {
    if (row.categories) tagSet.set(row.categories.id, row.categories);
  }
  if (product.primary_category_id) tagSet.delete(product.primary_category_id);
  const tagList = Array.from(tagSet.values());

  const addItemData = {
    product_id: product.id,
    sku: product.sku,
    name: product.name,
    slug: product.slug,
    brand_name: brandName,
    price: Number(product.retail_price),
    pack_size: product.pack_size,
    image_url: primary ? bcImage(primary.url, 'mid') : null,
  };

  const categoryCrumb = product.primary_category
    ? { href: `/shop/${product.primary_category.slug}`, label: product.primary_category.name }
    : null;

  return (
    <>
      {/* Breadcrumb */}
      <section className="bg-paper">
        <div className="max-w-content mx-auto px-8 pt-10 pb-2 max-md:px-4 max-md:pt-4">
          <nav
            aria-label="Breadcrumb"
            className="type-data-mono text-ink-muted flex items-center gap-2 flex-wrap"
          >
            <Link href="/" className="hover:text-brand-deep transition-colors duration-200">
              Home
            </Link>
            <span aria-hidden="true" className="text-ink-muted/60">·</span>
            <Link href="/shop" className="hover:text-brand-deep transition-colors duration-200">
              Shop
            </Link>
            {categoryCrumb && (
              <>
                <span aria-hidden="true" className="text-ink-muted/60">·</span>
                <Link
                  href={categoryCrumb.href}
                  className="hover:text-brand-deep transition-colors duration-200"
                >
                  {categoryCrumb.label}
                </Link>
              </>
            )}
            <span aria-hidden="true" className="text-ink-muted/60">·</span>
            <span className="text-ink truncate max-w-[50ch]">{product.name}</span>
          </nav>
        </div>
      </section>

      {/* Main 2-column hero */}
      <section className="bg-paper">
        <div className="max-w-content mx-auto px-8 pt-8 pb-20 max-md:px-4 max-md:pt-4 max-md:pb-8">
          <div className="grid gap-12 max-lg:gap-8 max-md:gap-5 lg:grid-cols-[1.5fr_1fr]">
            {/* Gallery — capped on mobile so it doesn't dominate the viewport */}
            <div className="max-md:max-h-[55vh] max-md:overflow-hidden">
              <ProductGallery
                images={gallery}
                productName={product.name}
                brandName={brandName}
                sku={product.sku}
              />
            </div>

            {/* Info panel */}
            <div className="flex flex-col gap-6 lg:pl-4 lg:pt-4 max-md:gap-4">
              {brandName && (
                <Link
                  href={product.brands ? `/brand/${product.brands.slug}` : '#'}
                  className="type-label text-brand-deep hover:text-ink transition-colors duration-200 self-start"
                >
                  {brandName}
                </Link>
              )}

              <h1 className="type-display-2">{renderProductName(product.name)}</h1>

              <p className="type-data-mono text-ink-muted">SKU · {product.sku}</p>

              <div
                className="flex items-baseline gap-3 pt-2 pb-6 max-md:pt-1 max-md:pb-4"
                style={{ borderBottom: '1px solid var(--rule)' }}
              >
                <span
                  className="type-price max-md:!text-[28px]"
                  style={{ fontSize: '40px', lineHeight: 1 }}
                >
                  ${dollars}
                  <sup
                    className="font-display max-md:!text-[13px]"
                    style={{
                      fontSize: '18px',
                      color: 'var(--color-ink-muted)',
                      marginLeft: '3px',
                      verticalAlign: 'super',
                    }}
                  >
                    {cents}
                  </sup>
                </span>
                {pack && (
                  <span className="type-data-mono text-ink-muted ml-2">{pack}</span>
                )}
              </div>

              <ProductAddPanel item={addItemData} />

              {tagList.length > 0 && (
                <div
                  className="flex flex-wrap gap-2 pt-6"
                  style={{ borderTop: '1px solid var(--rule)' }}
                >
                  <span className="type-label-sm text-ink-muted mr-2 self-center">
                    Also in
                  </span>
                  {tagList.map((t) => (
                    <Link
                      key={t.id}
                      href={`/shop/${t.slug}`}
                      className="type-label-sm text-ink hover:text-cream hover:bg-ink transition-colors duration-200"
                      style={{
                        padding: '6px 10px',
                        border: '1px solid var(--rule-strong)',
                      }}
                    >
                      {t.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Description block */}
      <section
        className="bg-paper-2"
        style={{ borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}
      >
        <div className="max-w-content mx-auto px-8 py-20 max-md:px-4 max-md:py-8">
          <div className="grid gap-14 max-lg:gap-10 max-md:gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="type-label text-accent mb-6">§ About this product</p>
              <ProductDescription html={product.description} />
            </div>
            <aside>
              <p className="type-label text-accent mb-6">§ Details</p>
              <dl
                className="flex flex-col"
                style={{ borderTop: '1px solid var(--rule-strong)' }}
              >
                {pack && (
                  <DetailRow label="Pack" value={pack} />
                )}
                {brandName && (
                  <DetailRow label="Brand" value={brandName} />
                )}
                {product.primary_category && (
                  <DetailRow label="Category" value={product.primary_category.name} />
                )}
                {weight && (
                  <DetailRow label="Weight" value={weight} />
                )}
                {product.units_per_pack && (
                  <DetailRow label="Units / pack" value={String(product.units_per_pack)} />
                )}
                <DetailRow label="SKU" value={product.sku} />
              </dl>
            </aside>
          </div>
        </div>
      </section>

      {/* Related products */}
      {related.length > 0 && (
        <Reveal as="section" className="bg-paper">
          <div className="max-w-content mx-auto px-8 pt-20 pb-20 max-md:px-4 max-md:pt-10 max-md:pb-10">
            <SectionHead
              numeral="II"
              eyebrow="You might also like"
              title={
                brandName
                  ? `More from {italic}${brandName}{/italic}.`
                  : 'More {italic}like this{/italic}.'
              }
            />
            <div className="grid gap-5 max-lg:grid-cols-2 max-sm:grid-cols-1 lg:grid-cols-4">
              {related.slice(0, 4).map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        </Reveal>
      )}
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-baseline justify-between gap-6 py-3.5"
      style={{ borderBottom: '1px solid var(--rule)' }}
    >
      <dt className="type-label-sm text-ink-muted">{label}</dt>
      <dd className="type-product text-ink text-right">{value}</dd>
    </div>
  );
}

export const dynamic = 'force-dynamic';
