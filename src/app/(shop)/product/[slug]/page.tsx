import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { Reveal } from '@/components/design-system/Reveal';
import { SectionHead } from '@/components/design-system/SectionHead';
import { ProductCard, type ProductCardData } from '@/components/shop/ProductCard';
import { ProductJsonLd } from '@/components/shop/ProductJsonLd';
import { bcImage } from '@/lib/bcImage';
import { pageMetadata, productTitle } from '@/lib/seo/metadata';
import { getPackPricing, primaryProductImage, productPackOptions } from '@/lib/product-pack-options';
import { ProductDetails, type ProductDetailData as ProductRow } from '@/components/shop/ProductDetails';
import { groupCatalogPacks } from '@/lib/catalog-pack-groups';

type Params = { slug: string };

const PRODUCT_SELECT = `
  id, slug, sku, name, description, short_description, pack_size, units_per_pack, pack_parent_id, pack_unit_label,
  weight_lb, retail_price, upc, stock_status, brand_id, primary_category_id,
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
    'id, slug, sku, name, pack_size, pack_parent_id, units_per_pack, pack_unit_label, retail_price, stock_status, brands(name, slug), product_images(url, alt_text, is_primary, display_order)';
  const rootId = product.pack_parent_id ?? product.id;
  const grouped = (rows: unknown) => groupCatalogPacks((rows ?? []) as ProductCardData[])
    .filter(candidate => (candidate.pack_parent_id ?? candidate.id) !== rootId)
    .slice(0, 4);

  if (product.brand_id) {
    const { data } = await supabase
      .from('products')
      .select(baseSelect)
      .eq('is_active', true)
      .eq('brand_id', product.brand_id)
      .neq('id', rootId)
      .or(`pack_parent_id.is.null,pack_parent_id.neq.${rootId}`)
      .order('id')
      .limit(24);
    const related = grouped(data);
    if (related.length >= 3) return related;
  }

  if (product.primary_category_id) {
    const { data } = await supabase
      .from('products')
      .select(`${baseSelect}, product_categories!inner(category_id)`)
      .eq('is_active', true)
      .eq('product_categories.category_id', product.primary_category_id)
      .neq('id', rootId)
      .or(`pack_parent_id.is.null,pack_parent_id.neq.${rootId}`)
      .order('id')
      .limit(24);
    if (data) return grouped(data);
  }

  return [];
}

async function fetchPackOptions(product: ProductRow): Promise<ProductRow[]> {
  if (!getPackPricing(product)) return [];
  const rootId = product.pack_parent_id ?? product.id;
  const { data, error } = await createClient()
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('is_active', true)
    .or(`id.eq.${rootId},pack_parent_id.eq.${rootId}`);
  if (error) throw new Error(`product pack options: ${error.message}`);
  return productPackOptions(product, (data ?? []) as unknown as ProductRow[]);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const product = await fetchProduct(params.slug);
  if (!product) return { title: 'Product not found' };
  const title = productTitle(product.name, product.brands?.name);
  const description =
    product.short_description ??
    `${product.name} from La Costa Gourmet. Bulk café supplies shipped from Carlsbad since 2003.`;
  const primary = primaryProductImage(product);
  return pageMetadata({
    title,
    description,
    canonical: `/product/${params.slug}/`,
    image: primary
      ? { url: bcImage(primary.url, 'hero'), alt: primary.alt_text || product.name }
      : undefined,
  });
}

export default async function ProductPage({ params }: { params: Params }) {
  const product = await fetchProduct(params.slug);
  if (!product) notFound();

  const [related, packOptions] = await Promise.all([fetchRelated(product), fetchPackOptions(product)]);

  const brandName = product.brands?.name ?? null;

  return (
    <>
      <ProductJsonLd product={product} />
      <ProductDetails key={product.id} product={product} options={packOptions} />

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

export const dynamic = 'force-dynamic';
