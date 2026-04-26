import { createAdminClient } from '@/lib/supabase/admin';
import { NewProductForm } from '@/components/admin/NewProductForm';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'New Product',
};

/**
 * /admin/products/new — server component that pre-loads the brands and
 * top-level categories so the client form has typed dropdown options
 * without a second round-trip on mount.
 */
export default async function NewProductPage() {
  const admin = createAdminClient();

  const [{ data: brandsData }, { data: categoriesData }] = await Promise.all([
    admin.from('brands').select('id, name, slug').eq('is_active', true).order('name'),
    admin
      .from('categories')
      .select('id, name, slug')
      .is('parent_id', null)
      .eq('is_active', true)
      .order('display_order'),
  ]);

  const brands = (brandsData ?? []).map((b) => ({
    id: b.id as string,
    name: b.name as string,
    slug: b.slug as string,
  }));
  const categories = (categoriesData ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    slug: c.slug as string,
  }));

  return (
    <>
      <header className="mb-8 pb-6" style={{ borderBottom: '1px solid var(--rule-strong)' }}>
        <p className="type-label text-accent mb-3">§ IV.a New product</p>
        <h1
          className="font-display text-ink max-md:!text-[24px]"
          style={{ fontSize: '40px', lineHeight: 1, letterSpacing: '-0.026em', fontWeight: 400 }}
        >
          Add a <em className="type-accent">product</em>.
        </h1>
        <p className="type-data-mono text-ink-muted mt-3 max-w-[640px]">
          Required fields marked *. The slug is generated from the name unless you
          override it. Image upload is optional but recommended — products without
          images render a placeholder on the storefront.
        </p>
      </header>

      <NewProductForm brands={brands} categories={categories} />
    </>
  );
}
