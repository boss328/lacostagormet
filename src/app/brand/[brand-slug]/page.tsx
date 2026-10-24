import { CatalogListing } from '@/components/shop/CatalogListing';
import { getCatalog } from '@/lib/catalog-query';
import { listingCanonical } from '@/lib/seo/canonical';
import { brandMetadata } from '@/lib/seo/metadata';
import { bcImage } from '@/lib/bcImage';
import { notFound } from 'next/navigation';
type Props = { params: { 'brand-slug': string }; searchParams: Record<string, string | string[] | undefined> };
export async function generateMetadata({ params, searchParams }: Props) {
  const slug = params['brand-slug'];
  const catalog = await getCatalog();
  const brand = catalog.brands.find(b => b.slug === slug);
  if (!brand) notFound();
  const product = catalog.products.find(p => p.brand_id === brand.id && p.product_images?.length);
  const image = product?.product_images?.find(image => image.is_primary) ?? product?.product_images?.[0];
  return brandMetadata(
    brand.name,
    listingCanonical(`/brand/${slug}`, searchParams),
    image && product ? { url: bcImage(image.url, 'hero'), alt: image.alt_text || product.name } : undefined,
  );
}
export default function BrandPage({ params, searchParams }: Props) { return <CatalogListing brand={params['brand-slug']} searchParams={searchParams} />; }
export const dynamic = 'force-dynamic';
