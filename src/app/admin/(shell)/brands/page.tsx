import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type BrandRow = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  primary_vendor_id: string | null;
  vendorName: string | null;
  productCount: number;
};

export default async function AdminBrandsPage() {
  const admin = createAdminClient();

  const [{ data: brandsData }, { data: vendorsData }] = await Promise.all([
    admin
      .from('brands')
      .select('id, name, slug, is_active, primary_vendor_id')
      .order('name', { ascending: true })
      .limit(300),
    admin.from('vendors').select('id, name'),
  ]);

  const vendorName = new Map((vendorsData ?? []).map((v) => [v.id as string, v.name as string]));
  const brands = (brandsData ?? []) as Array<Omit<BrandRow, 'vendorName' | 'productCount'>>;

  const enriched: BrandRow[] = await Promise.all(
    brands.map(async (b) => {
      const { count } = await admin
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('brand_id', b.id);
      return {
        ...b,
        vendorName: b.primary_vendor_id ? vendorName.get(b.primary_vendor_id) ?? null : null,
        productCount: count ?? 0,
      };
    }),
  );

  const cols = 'minmax(180px,1.4fr) minmax(140px,1fr) minmax(140px,1fr) auto auto';

  return (
    <>
      <header className="mb-8 pb-6" style={{ borderBottom: '1px solid var(--rule-strong)' }}>
        <p className="type-label text-accent mb-3">§ X. Brands</p>
        <div className="flex items-baseline justify-between gap-6 flex-wrap">
          <h1
            className="font-display text-ink max-md:!text-[24px]"
            style={{ fontSize: '40px', lineHeight: 1, letterSpacing: '-0.026em', fontWeight: 400 }}
          >
            The <em className="type-accent">makers</em>.
          </h1>
          <div className="flex items-center gap-5">
            <Link
              href="/admin/brands/new/"
              className="type-label-sm text-cream"
              style={{ padding: '10px 18px', background: 'var(--color-ink)' }}
            >
              + Add Brand
            </Link>
            <span className="type-data-mono text-ink-muted">
              {enriched.length.toLocaleString()} total
            </span>
          </div>
        </div>
        <p className="type-data-mono text-ink-muted mt-3 max-w-[640px]">
          The preferred vendor maps a brand to the supplier its purchase orders draft to.
          Hidden brands drop off the storefront but keep their products.
        </p>
      </header>

      {enriched.length === 0 ? (
        <div className="bg-paper-2 text-center px-10 py-20" style={{ border: '1px solid var(--rule)' }}>
          <p
            className="font-display italic text-brand-deep mb-4"
            style={{ fontSize: '24px', letterSpacing: '-0.02em' }}
          >
            No brands yet.
          </p>
          <p className="type-data-mono text-ink-muted">Add your first brand to tag products.</p>
        </div>
      ) : (
        <div className="overflow-x-auto" style={{ border: '1px solid var(--rule)', background: 'var(--color-cream)' }}>
          <div
            className="grid items-center gap-4 px-5 py-4 bg-paper-2 min-w-[760px]"
            style={{ gridTemplateColumns: cols, borderBottom: '1px solid var(--rule-strong)' }}
          >
            <span className="type-label-sm text-ink">Brand</span>
            <span className="type-label-sm text-ink">Slug</span>
            <span className="type-label-sm text-ink">Preferred vendor</span>
            <span className="type-label-sm text-ink text-right">Products</span>
            <span className="type-label-sm text-ink text-right">Status</span>
          </div>
          {enriched.map((b) => (
            <Link
              key={b.id}
              href={`/admin/brands/${b.id}/`}
              className="grid items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-cream min-w-[760px]"
              style={{ gridTemplateColumns: cols, borderBottom: '1px solid var(--rule)', minHeight: 56 }}
            >
              <p
                className="font-display italic text-brand-deep"
                style={{ fontSize: '15.5px', fontWeight: 500, letterSpacing: '-0.015em' }}
              >
                {b.name}
              </p>
              <span className="font-mono text-ink-2 truncate" style={{ fontSize: '12.5px' }}>
                {b.slug}
              </span>
              <span className="font-display text-ink-2 truncate" style={{ fontSize: '13.5px' }}>
                {b.vendorName ?? '—'}
              </span>
              <span className="type-data-mono text-ink-2 text-right">{b.productCount}</span>
              <span
                className="type-data-mono text-right"
                style={{ color: b.is_active ? 'var(--color-forest)' : 'var(--color-ink-muted)' }}
              >
                {b.is_active ? 'Live' : 'Hidden'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
