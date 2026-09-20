import { CatalogListing } from '@/components/shop/CatalogListing';
import { getCatalog } from '@/lib/catalog-query';
import { listingCanonical } from '@/lib/seo/canonical';
type Props = { params: { 'brand-slug': string }; searchParams: Record<string, string | string[] | undefined> };
export async function generateMetadata({ params, searchParams }: Props) {
  const slug = params['brand-slug'];
  return { title: (await getCatalog()).brands.find(b => b.slug === slug)?.name ?? 'Brand', alternates: { canonical: listingCanonical(`/brand/${slug}`, searchParams) } };
}
export default function BrandPage({ params, searchParams }: Props) { return <CatalogListing brand={params['brand-slug']} searchParams={searchParams} />; }
export const dynamic = 'force-dynamic';
