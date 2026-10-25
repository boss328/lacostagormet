import Link from 'next/link';
import { getCatalog } from '@/lib/catalog-query';
import { groupCatalogPacks } from '@/lib/catalog-pack-groups';
import { PageHeader } from '@/components/shop/PageHeader';
import { pageMetadata } from '@/lib/seo/metadata';
export const dynamic = 'force-dynamic';
export const metadata = pageMetadata({
  title: 'Our brands',
  description: 'Explore the café brands available at La Costa Gourmet. Shop coffee, chai, drink mixes, syrups and more by your favorite brand.',
  canonical: '/brand/',
});
export default async function BrandsPage() {
  const { brands, products } = await getCatalog();
  return (
    <>
      <PageHeader
        breadcrumb={[{ href: '/', label: 'Home' }, { label: 'Brands' }]}
        eyebrow="Your go-to brands"
        title="All your favorites. Together."
        lede="Discover the names behind your everyday drinks and your next menu favorite."
      />
      <section className="home-section wrap">
        <div className="brand-directory">
          {brands.map((b) => {
            const count = groupCatalogPacks(products.filter((p) => p.brand_id === b.id)).length;
            return (
              <Link key={b.id} href={`/brand/${b.slug}`}>
                <h2>{b.name}</h2>
                <p>
                  {count ? `${count} products` : 'Products coming soon'}
                  <span aria-hidden="true">↗</span>
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}
