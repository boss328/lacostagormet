import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { CategoryEditForm } from '@/components/admin/categories/CategoryEditForm';

export const dynamic = 'force-dynamic';

type CategoryDetail = {
  id: string;
  name: string;
  slug: string;
  display_order: number;
  is_active: boolean;
  description: string | null;
  meta_title: string | null;
  meta_description: string | null;
};

export default async function AdminCategoryEditPage({ params }: { params: { id: string } }) {
  const admin = createAdminClient();

  const { data } = await admin
    .from('categories')
    .select('id, name, slug, display_order, is_active, description, meta_title, meta_description')
    .eq('id', params.id)
    .maybeSingle();

  if (!data) notFound();
  const c = data as CategoryDetail;

  const { count } = await admin
    .from('product_categories')
    .select('category_id', { count: 'exact', head: true })
    .eq('category_id', c.id);
  const productCount = count ?? 0;

  return (
    <>
      <Link
        href="/admin/categories/"
        className="type-label text-ink-muted hover:text-brand-deep transition-colors duration-200 inline-block mb-5"
      >
        ← All categories
      </Link>

      <header className="mb-8 pb-6" style={{ borderBottom: '1px solid var(--rule-strong)' }}>
        <p className="type-label text-accent mb-3">§ IX. Categories / Edit</p>
        <div className="flex items-baseline justify-between gap-6 flex-wrap">
          <h1
            className="font-display text-ink max-md:!text-[24px]"
            style={{ fontSize: '40px', lineHeight: 1.05, letterSpacing: '-0.026em', fontWeight: 400 }}
          >
            {c.name}
          </h1>
          <Link
            href={`/shop/${c.slug}/`}
            className="type-label text-ink hover:text-brand-deep transition-colors duration-200"
            target="_blank"
            rel="noreferrer"
          >
            View on site →
          </Link>
        </div>
        <p className="type-data-mono text-ink-muted mt-3">
          {productCount} product{productCount === 1 ? '' : 's'} · {c.is_active ? 'Live' : 'Hidden'}
        </p>
      </header>

      <CategoryEditForm category={c} productCount={productCount} />
    </>
  );
}
