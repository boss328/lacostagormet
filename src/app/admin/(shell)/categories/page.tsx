import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  display_order: number;
  is_active: boolean;
  productCount: number;
};

export default async function AdminCategoriesPage() {
  const admin = createAdminClient();

  const { data: catsData } = await admin
    .from('categories')
    .select('id, name, slug, display_order, is_active')
    .is('parent_id', null)
    .order('display_order', { ascending: true })
    .limit(200);

  const cats = (catsData ?? []) as Array<Omit<CategoryRow, 'productCount'>>;

  // Per-category product count via the M2M join (matches the storefront count).
  const enriched: CategoryRow[] = await Promise.all(
    cats.map(async (c) => {
      const { count } = await admin
        .from('product_categories')
        .select('category_id', { count: 'exact', head: true })
        .eq('category_id', c.id);
      return { ...c, productCount: count ?? 0 };
    }),
  );

  const cols = 'minmax(200px,1.6fr) minmax(160px,1fr) auto auto auto';

  return (
    <>
      <header className="mb-8 pb-6" style={{ borderBottom: '1px solid var(--rule-strong)' }}>
        <p className="type-label text-accent mb-3">§ IX. Categories</p>
        <div className="flex items-baseline justify-between gap-6 flex-wrap">
          <h1
            className="font-display text-ink max-md:!text-[24px]"
            style={{ fontSize: '40px', lineHeight: 1, letterSpacing: '-0.026em', fontWeight: 400 }}
          >
            The <em className="type-accent">departments</em>.
          </h1>
          <div className="flex items-center gap-5">
            <Link
              href="/admin/categories/new/"
              className="type-label-sm text-cream"
              style={{ padding: '10px 18px', background: 'var(--color-ink)' }}
            >
              + Add Category
            </Link>
            <span className="type-data-mono text-ink-muted">
              {enriched.length.toLocaleString()} total
            </span>
          </div>
        </div>
        <p className="type-data-mono text-ink-muted mt-3 max-w-[640px]">
          Order controls the sequence on the homepage and /shop. Hidden categories
          drop off the storefront but keep their products.
        </p>
      </header>

      {enriched.length === 0 ? (
        <div className="bg-paper-2 text-center px-10 py-20" style={{ border: '1px solid var(--rule)' }}>
          <p
            className="font-display italic text-brand-deep mb-4"
            style={{ fontSize: '24px', letterSpacing: '-0.02em' }}
          >
            No categories yet.
          </p>
          <p className="type-data-mono text-ink-muted">Add your first category to group products.</p>
        </div>
      ) : (
        <div className="overflow-x-auto" style={{ border: '1px solid var(--rule)', background: 'var(--color-cream)' }}>
          <div
            className="grid items-center gap-4 px-5 py-4 bg-paper-2 min-w-[720px]"
            style={{ gridTemplateColumns: cols, borderBottom: '1px solid var(--rule-strong)' }}
          >
            <span className="type-label-sm text-ink">Category</span>
            <span className="type-label-sm text-ink">Slug</span>
            <span className="type-label-sm text-ink text-right">Order</span>
            <span className="type-label-sm text-ink text-right">Products</span>
            <span className="type-label-sm text-ink text-right">Status</span>
          </div>
          {enriched.map((c) => (
            <Link
              key={c.id}
              href={`/admin/categories/${c.id}/`}
              className="grid items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-cream min-w-[720px]"
              style={{ gridTemplateColumns: cols, borderBottom: '1px solid var(--rule)', minHeight: 56 }}
            >
              <p
                className="font-display italic text-brand-deep"
                style={{ fontSize: '15.5px', fontWeight: 500, letterSpacing: '-0.015em' }}
              >
                {c.name}
              </p>
              <span className="font-mono text-ink-2 truncate" style={{ fontSize: '12.5px' }}>
                {c.slug}
              </span>
              <span className="type-data-mono text-ink-2 text-right">{c.display_order}</span>
              <span className="type-data-mono text-ink-2 text-right">{c.productCount}</span>
              <span
                className="type-data-mono text-right"
                style={{ color: c.is_active ? 'var(--color-forest)' : 'var(--color-ink-muted)' }}
              >
                {c.is_active ? 'Live' : 'Hidden'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
