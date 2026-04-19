import Link from 'next/link';
import Image from 'next/image';
import { createAdminClient } from '@/lib/supabase/admin';
import { bcImage } from '@/lib/bcImage';

export const dynamic = 'force-dynamic';

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  retail_price: number | string;
  wholesale_cost: number | string | null;
  is_active: boolean;
  stock_status: string;
  brand_id: string | null;
  brands: { name: string; slug: string } | null;
  product_images: Array<{ url: string; is_primary: boolean; display_order: number }> | null;
};

function fmt(v: number | string): string {
  const n = typeof v === 'string' ? Number(v) : v;
  return `$${n.toFixed(2)}`;
}

function pickPrimary(
  images: Array<{ url: string; is_primary: boolean; display_order: number }> | null,
): string | null {
  if (!images || images.length === 0) return null;
  const p =
    images.find((i) => i.is_primary) ??
    [...images].sort((a, b) => a.display_order - b.display_order)[0];
  return p?.url ?? null;
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const search = typeof searchParams.q === 'string' ? searchParams.q : undefined;
  const admin = createAdminClient();

  let q = admin
    .from('products')
    .select(
      'id, sku, name, retail_price, wholesale_cost, is_active, stock_status, brand_id, brands(name, slug), product_images(url, is_primary, display_order)',
      { count: 'exact' },
    );
  if (search) q = q.or(`sku.ilike.%${search}%,name.ilike.%${search}%`);
  q = q.order('name', { ascending: true }).limit(200);

  const { data, count } = await q;
  const rows = (data ?? []) as unknown as ProductRow[];

  return (
    <>
      <header className="mb-8">
        <p className="type-label text-accent mb-3">§ Products</p>
        <h1 className="type-display-2">Catalog.</h1>
        <p className="type-data-mono text-ink-muted mt-3">
          {(count ?? 0).toLocaleString()} {count === 1 ? 'product' : 'products'}
        </p>
      </header>

      <form method="GET" action="/admin/products" className="flex items-center gap-4 mb-6 flex-wrap">
        <input
          type="search"
          name="q"
          placeholder="SKU or name"
          defaultValue={search ?? ''}
          className="bg-cream text-ink font-display flex-1 min-w-[240px]"
          style={{
            border: '1px solid var(--rule-strong)',
            padding: '10px 14px',
            fontSize: '14px',
            minHeight: 44,
          }}
        />
        <button type="submit" className="btn btn-solid" style={{ padding: '12px 22px' }}>
          <span>Search</span>
          <span className="btn-arrow" aria-hidden="true">→</span>
        </button>
        {search && (
          <Link
            href="/admin/products"
            className="type-label text-ink-muted hover:text-accent transition-colors duration-200"
          >
            Clear
          </Link>
        )}
      </form>

      <div style={{ border: '1px solid var(--rule)', background: 'var(--color-cream)' }}>
        <div
          className="grid items-center gap-4 px-4 py-3 bg-paper-2"
          style={{
            gridTemplateColumns: '60px 1fr minmax(140px,auto) minmax(120px,auto) auto auto auto',
            borderBottom: '1px solid var(--rule-strong)',
          }}
        >
          <span className="type-label-sm text-ink">Img</span>
          <span className="type-label-sm text-ink">SKU · Name</span>
          <span className="type-label-sm text-ink">Brand</span>
          <span className="type-label-sm text-ink text-right">Retail</span>
          <span className="type-label-sm text-ink text-right">Cost</span>
          <span className="type-label-sm text-ink">Stock</span>
          <span className="type-label-sm text-ink">Active</span>
        </div>
        {rows.map((p) => {
          const url = pickPrimary(p.product_images);
          const thumb = url ? bcImage(url, 'card') : null;
          return (
            <Link
              key={p.id}
              href={`/admin/products/${p.id}`}
              className="grid items-center gap-4 px-4 py-3 hover:bg-paper-2 transition-colors duration-200"
              style={{
                gridTemplateColumns: '60px 1fr minmax(140px,auto) minmax(120px,auto) auto auto auto',
                borderBottom: '1px solid var(--rule)',
                minHeight: 64,
              }}
            >
              <div
                className="relative overflow-hidden"
                style={{
                  width: 48,
                  height: 48,
                  border: '1px solid var(--rule)',
                  background:
                    'radial-gradient(ellipse at center, var(--color-cream) 0%, var(--color-paper-2) 115%)',
                }}
              >
                {thumb ? (
                  <Image
                    src={thumb}
                    alt=""
                    width={96}
                    height={96}
                    className="w-full h-full object-contain img-product"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="type-data-mono text-ink-muted">—</span>
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="type-data-mono text-ink-muted truncate">{p.sku}</p>
                <p className="font-display text-ink truncate" style={{ fontSize: '14px' }}>
                  {p.name}
                </p>
              </div>
              <span className="font-display text-ink truncate">{p.brands?.name ?? '—'}</span>
              <span className="font-display text-ink text-right" style={{ fontSize: '14px' }}>
                {fmt(p.retail_price)}
              </span>
              <span className="type-data-mono text-ink-muted text-right">
                {p.wholesale_cost != null ? fmt(p.wholesale_cost) : '—'}
              </span>
              <span className="type-data-mono text-ink-muted">
                {p.stock_status.replace(/_/g, ' ')}
              </span>
              <span className="type-data-mono">
                {p.is_active ? (
                  <span className="text-forest">yes</span>
                ) : (
                  <span className="text-accent">no</span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
