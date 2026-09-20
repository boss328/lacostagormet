import { CatalogListing } from '@/components/shop/CatalogListing';
export const metadata = { title: 'Search products', robots: { index: false, follow: true } };
export const dynamic = 'force-dynamic';
export default function SearchPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) { return <CatalogListing search searchParams={searchParams} />; }
