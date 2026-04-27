import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { bcImage } from '@/lib/bcImage';
import { EditProductForm } from '@/components/admin/EditProductForm';

export const dynamic = 'force-dynamic';

type ProductDetailRow = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  description: string | null;
  meta_description: string | null;
  weight_lb: number | string | null;
  retail_price: number | string;
  is_active: boolean;
  is_featured: boolean;
  brand_id: string | null;
  primary_category_id: string | null;
  brands: { name: string; slug: string } | null;
  primary_category: { name: string; slug: string } | null;
  product_images: Array<{ url: string; is_primary: boolean; display_order: number }> | null;
};

function pickPrimaryImageUrl(
  images: Array<{ url: string; is_primary: boolean; display_order: number }> | null,
): string | null {
  if (!images || images.length === 0) return null;
  const p =
    images.find((i) => i.is_primary) ??
    [...images].sort((a, b) => a.display_order - b.display_order)[0];
  return p?.url ?? null;
}

export default async function AdminProductEditPage({
  params,
}: {
  params: { id: string };
}) {
  const admin = createAdminClient();

  const [{ data: productData }, { data: brandsData }, { data: categoriesData }] =
    await Promise.all([
      admin
        .from('products')
        .select(
          'id, sku, slug, name, description, meta_description, weight_lb, retail_price, is_active, is_featured, brand_id, primary_category_id, brands(name, slug), primary_category:categories!primary_category_id(name, slug), product_images(url, is_primary, display_order)',
        )
        .eq('id', params.id)
        .maybeSingle(),
      admin.from('brands').select('id, name, slug').eq('is_active', true).order('name'),
      admin
        .from('categories')
        .select('id, name, slug')
        .is('parent_id', null)
        .eq('is_active', true)
        .order('display_order'),
    ]);

  if (!productData) notFound();
  const p = productData as unknown as ProductDetailRow;

  const rawImage = pickPrimaryImageUrl(p.product_images);
  // Existing migrated BigCommerce images need bcImage() to resolve a CDN
  // size; admin-uploaded Supabase URLs already contain the full path.
  const imageUrl = rawImage
    ? rawImage.startsWith('http')
      ? rawImage
      : bcImage(rawImage, 'card')
    : null;

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
      <Link
        href="/admin/products/"
        className="type-label text-ink-muted hover:text-brand-deep transition-colors duration-200 inline-block mb-5"
      >
        ←&nbsp;All products
      </Link>

      <header className="mb-8 pb-6" style={{ borderBottom: '1px solid var(--rule-strong)' }}>
        <p className="type-label text-accent mb-3">§ IV.b Edit product</p>
        <div className="flex items-baseline justify-between gap-6 flex-wrap">
          <h1
            className="font-display text-ink max-md:!text-[24px]"
            style={{ fontSize: '40px', lineHeight: 1.05, letterSpacing: '-0.026em', fontWeight: 400 }}
          >
            {p.name}
          </h1>
          <Link
            href={`/product/${p.slug}`}
            className="type-label text-ink hover:text-brand-deep transition-colors duration-200"
            target="_blank"
            rel="noreferrer"
          >
            View on site →
          </Link>
        </div>
        <p className="type-data-mono text-ink-muted mt-3">
          SKU {p.sku}
          {p.brands ? ` · ${p.brands.name}` : ''}
          {p.primary_category ? ` · ${p.primary_category.name}` : ''}
        </p>
      </header>

      <EditProductForm
        product={{
          id: p.id,
          name: p.name,
          sku: p.sku,
          retailPrice: Number(p.retail_price),
          categorySlug: p.primary_category?.slug ?? '',
          brandSlug: p.brands?.slug ?? '',
          description: p.description ?? '',
          weightLb: p.weight_lb != null ? Number(p.weight_lb) : null,
          slug: p.slug,
          metaDescription: p.meta_description ?? '',
          isActive: p.is_active,
          isFeatured: p.is_featured,
          imageUrl,
        }}
        brands={brands}
        categories={categories}
      />
    </>
  );
}
