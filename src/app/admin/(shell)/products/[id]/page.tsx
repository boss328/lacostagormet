import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { bcImage } from '@/lib/bcImage';
import { AdminProductForm } from '@/components/admin/AdminProductForm';

export const dynamic = 'force-dynamic';

type ProductDetailRow = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  description: string | null;
  short_description: string | null;
  pack_size: string | null;
  retail_price: number | string;
  wholesale_cost: number | string | null;
  is_active: boolean;
  is_featured: boolean;
  stock_status: string;
  brand_id: string | null;
  primary_category_id: string | null;
  brands: { name: string; slug: string } | null;
  primary_category: { name: string; slug: string } | null;
  product_images: Array<{ url: string; is_primary: boolean; display_order: number }> | null;
};

export default async function AdminProductDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const admin = createAdminClient();
  const { data: product } = await admin
    .from('products')
    .select(
      'id, sku, slug, name, description, short_description, pack_size, retail_price, wholesale_cost, is_active, is_featured, stock_status, brand_id, primary_category_id, brands(name, slug), primary_category:categories!primary_category_id(name, slug), product_images(url, is_primary, display_order)',
    )
    .eq('id', params.id)
    .maybeSingle();

  if (!product) notFound();
  const p = product as unknown as ProductDetailRow;

  const sortedImages = [...(p.product_images ?? [])].sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;
    return a.display_order - b.display_order;
  });

  return (
    <>
      <Link
        href="/admin/products/"
        className="type-label text-ink-muted hover:text-brand-deep transition-colors duration-200 inline-block mb-5"
      >
        ←&nbsp;All products
      </Link>

      <header className="mb-8">
        <p className="type-label text-accent mb-3">§ Product</p>
        <h1 className="type-display-2">{p.name}</h1>
        <p className="type-data-mono text-ink-muted mt-3">
          SKU {p.sku}
          {p.brands ? ` · ${p.brands.name}` : ''}
          {p.primary_category ? ` · ${p.primary_category.name}` : ''}
        </p>
        <Link
          href={`/product/${p.slug}`}
          className="type-label text-ink hover:text-brand-deep transition-colors duration-200 mt-3 inline-block"
          target="_blank"
          rel="noreferrer"
        >
          View on site&nbsp;→
        </Link>
      </header>

      <section className="grid gap-8 lg:grid-cols-[300px_1fr] max-lg:gap-6">
        <div>
          <div className="grid grid-cols-3 gap-2">
            {sortedImages.slice(0, 9).map((img, i) => (
              <div
                key={img.url + i}
                className="relative overflow-hidden"
                style={{
                  aspectRatio: '1 / 1',
                  border: '1px solid var(--rule)',
                  background:
                    'radial-gradient(ellipse at center, var(--color-cream) 0%, var(--color-paper-2) 115%)',
                }}
              >
                <Image
                  src={bcImage(img.url, 'card')}
                  alt=""
                  width={200}
                  height={200}
                  className="w-full h-full object-contain img-product"
                />
                {img.is_primary && (
                  <span
                    className="absolute top-1 left-1 type-label-sm text-cream"
                    style={{ padding: '2px 6px', background: 'var(--color-ink)', fontSize: '9px' }}
                  >
                    Primary
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="type-data-mono text-ink-muted mt-3">
            {sortedImages.length} image{sortedImages.length === 1 ? '' : 's'} · upload arrives in
            Phase 7
          </p>
        </div>

        <AdminProductForm
          productId={p.id}
          initialName={p.name}
          initialRetailPrice={Number(p.retail_price)}
          initialWholesaleCost={p.wholesale_cost != null ? Number(p.wholesale_cost) : null}
          initialIsActive={p.is_active}
          initialIsFeatured={p.is_featured}
          initialStockStatus={p.stock_status}
          initialShortDescription={p.short_description ?? ''}
        />
      </section>
    </>
  );
}
