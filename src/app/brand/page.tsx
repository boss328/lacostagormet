import Link from 'next/link';
import { getCatalog } from '@/lib/catalog-query';
import { PageHeader } from '@/components/shop/PageHeader';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Our brands',
  alternates: { canonical: '/brand/' },
};
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
            const count = products.filter((p) => p.brand_id === b.id).length;
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
