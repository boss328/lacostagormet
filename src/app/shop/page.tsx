import { CatalogListing } from '@/components/shop/CatalogListing';
import { listingCanonical } from '@/lib/seo/canonical';
import { pageMetadata } from '@/lib/seo/metadata';
type Props = { searchParams: Record<string, string | string[] | undefined> };
export function generateMetadata({ searchParams }: Props) {
  return pageMetadata({
    title: 'Shop all products',
    description: 'Browse the full La Costa Gourmet catalog. Shop café drink mixes, coffee, tea, syrups, oatmeal and more, with filters for category, brand and price.',
    canonical: listingCanonical('/shop', searchParams),
  });
}
export default function ShopPage({ searchParams }: Props) { return <CatalogListing searchParams={searchParams} />; }
export const dynamic = 'force-dynamic';
