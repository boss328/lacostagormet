import { createClient } from '@/lib/supabase/server';
import { Reveal } from '@/components/design-system/Reveal';
import { PageHeader } from '@/components/shop/PageHeader';
import { BrandRow, type BrandRowData } from '@/components/shop/BrandRow';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Brands',
  description:
    'Every label we carry — Big Train, David Rio, Mocafe, Monin, Torani, and the rest of the family. Bulk café supplies shipped from Carlsbad since 2003.',
};

/**
 * /brand — index page listing every active brand we carry.
 *
 * Mirrors the editorial brand grid the homepage already renders (BrandRow
 * tiles in a 4-column gap-px grid). The single source of truth for the
 * brand → product count is the products table; we count via FK rather
 * than a SQL function to stay consistent with the homepage data path.
 */
export default async function BrandsIndexPage() {
  const supabase = createClient();

  const [brandsRes, brandCountsRes] = await Promise.all([
    supabase
      .from('brands')
      .select('id, name, slug')
      .eq('is_active', true)
      .order('name'),
    supabase.from('products').select('brand_id').eq('is_active', true),
  ]);

  const brandCounts = new Map<string, number>();
  for (const row of brandCountsRes.data ?? []) {
    if (row.brand_id) {
      brandCounts.set(row.brand_id, (brandCounts.get(row.brand_id) ?? 0) + 1);
    }
  }

  const brands: BrandRowData[] = (brandsRes.data ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
    itemCount: brandCounts.get(b.id) ?? 0,
  }));

  const totalItems = brands.reduce((s, b) => s + b.itemCount, 0);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: '/', label: 'Home' },
          { label: 'Brands' },
        ]}
        eyebrow="§ The Cellar — Brands"
        title={
          <>
            Every <em className="type-accent">label</em> we carry.
          </>
        }
        lede={`${brands.length} active brands · ${totalItems.toLocaleString()} items in stock. Click through to the catalog filtered to that label.`}
      />

      <Reveal as="section" className="bg-paper">
        <div className="max-w-content mx-auto px-8 py-14 max-sm:px-5 max-sm:py-10">
          {brands.length === 0 ? (
            <p className="type-data-mono text-ink-muted text-center py-16">
              No active brands on file yet.
            </p>
          ) : (
            <div
              className="grid gap-px max-lg:grid-cols-2 max-sm:grid-cols-1 lg:grid-cols-4"
              style={{ background: 'var(--rule)' }}
            >
              {brands.map((b) => (
                <BrandRow key={b.id} brand={b} />
              ))}
            </div>
          )}
        </div>
      </Reveal>
    </>
  );
}
