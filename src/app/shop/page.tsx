import { CatalogListing } from '@/components/shop/CatalogListing';
import { listingCanonical } from '@/lib/seo/canonical';
type Props = { searchParams: Record<string, string | string[] | undefined> };
export function generateMetadata({ searchParams }: Props) { return { title: 'Shop all products', alternates: { canonical: listingCanonical('/shop', searchParams) } }; }
export default function ShopPage({ searchParams }: Props) { return <CatalogListing searchParams={searchParams} />; }
export const dynamic = 'force-dynamic';
