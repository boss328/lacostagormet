import { CatalogListing } from '@/components/shop/CatalogListing';
import { COLLECTIONS } from '@/lib/collections';
import { getCatalog } from '@/lib/catalog-query';
import { listingCanonical } from '@/lib/seo/canonical';
type Props = { params: { 'category-slug': string }; searchParams: Record<string, string | string[] | undefined> };
export async function generateMetadata({ params, searchParams }: Props) {
  const slug = params['category-slug'];
  const name = COLLECTIONS.find(c => c.slug === slug)?.name ?? (await getCatalog()).categories.find(c => c.slug === slug)?.name ?? 'Category';
  return { title: name, alternates: { canonical: listingCanonical(`/shop/${slug}`, searchParams) } };
}
export default function CategoryPage({ params, searchParams }: Props) { return <CatalogListing category={params['category-slug']} searchParams={searchParams} />; }
export const dynamic = 'force-dynamic';
