import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { BrandEditForm } from '@/components/admin/brands/BrandEditForm';

export const dynamic = 'force-dynamic';

type BrandDetail = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  description: string | null;
  primary_vendor_id: string | null;
};

export default async function AdminBrandEditPage({ params }: { params: { id: string } }) {
  const admin = createAdminClient();

  const [{ data }, { data: vendorsData }] = await Promise.all([
    admin
      .from('brands')
      .select('id, name, slug, is_active, description, primary_vendor_id')
      .eq('id', params.id)
      .maybeSingle(),
    admin.from('vendors').select('id, name').is('deleted_at', null).order('name', { ascending: true }),
  ]);

  if (!data) notFound();
  const b = data as BrandDetail;
  const vendors = (vendorsData ?? []) as Array<{ id: string; name: string }>;

  const { count } = await admin
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', b.id);
  const productCount = count ?? 0;

  return (
    <>
      <Link
        href="/admin/brands/"
        className="type-label text-ink-muted hover:text-brand-deep transition-colors duration-200 inline-block mb-5"
      >
        ← All brands
      </Link>

      <header className="mb-8 pb-6" style={{ borderBottom: '1px solid var(--rule-strong)' }}>
        <p className="type-label text-accent mb-3">§ X. Brands / Edit</p>
        <div className="flex items-baseline justify-between gap-6 flex-wrap">
          <h1
            className="font-display text-ink max-md:!text-[24px]"
            style={{ fontSize: '40px', lineHeight: 1.05, letterSpacing: '-0.026em', fontWeight: 400 }}
          >
            {b.name}
          </h1>
          <Link
            href={`/brand/${b.slug}/`}
            className="type-label text-ink hover:text-brand-deep transition-colors duration-200"
            target="_blank"
            rel="noreferrer"
          >
            View on site →
          </Link>
        </div>
        <p className="type-data-mono text-ink-muted mt-3">
          {productCount} product{productCount === 1 ? '' : 's'} · {b.is_active ? 'Live' : 'Hidden'}
        </p>
      </header>

      <BrandEditForm brand={b} vendors={vendors} productCount={productCount} />
    </>
  );
}
