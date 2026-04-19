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

function margin(retail: number, cost: number | null): string {
  if (cost === null || retail <= 0) return '—';
  return `${Math.round(((retail - cost) / retail) * 100)}%`;
}

function buildHref(base: string, params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
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
      <header className="mb-6">
        <p className="type-label text-accent mb-3">§ Products</p>
        <div className="flex items-baseline justify-between gap-6 flex-wrap">
          <h1
            className="font-display text-ink"
            style={{ fontSize: '36px', lineHeight: 1, letterSpacing: '-0.025em' }}
          >
            The <em className="type-accent">catalog</em>.
          </h1>
          <div className="flex items-center gap-4">
            <Link
              href={buildHref('/api/admin/products/export', { q: search })}
              className="type-label-sm text-ink hover:text-brand-deep transition-colors duration-200"
            >
              Export CSV →
            </Link>
            <span className="type-data-mono text-ink-muted">
              {(count ?? 0).toLocaleString()} active + inactive
            </span>
          </div>
        </div>
      </header>

      <form method="GET" action="/admin/products" className="flex items-center gap-3 mb-5 flex-wrap">
        <input
          type="search"
          name="q"
          placeholder="SKU or name"
          defaultValue={search ?? ''}
          className="bg-cream text-ink font-display flex-1 min-w-[240px]"
          style={{
            border: '1px solid var(--rule-strong)',
            padding: '9px 14px',
            fontSize: '14px',
            minHeight: 38,
          }}
        />
        <button
          type="submit"
          className="type-label-sm text-ink"
          style={{
            padding: '9px 16px',
            border: '1px solid var(--color-ink)',
            background: 'var(--color-cream)',
          }}
        >
          Search
        </button>
        {search && (
          <Link href="/admin/products" className="type-label-sm text-ink-muted hover:text-accent">
            Clear
          </Link>
        )}
      </form>

      <div style={{ border: '1px solid var(--rule)', background: 'var(--color-cream)' }}>
        <div
          className="grid items-center gap-4 px-4 py-3 bg-paper-2"
          style={{
            gridTemplateColumns: '48px 1fr minmax(140px,auto) minmax(80px,auto) minmax(80px,auto) minmax(60px,auto) auto auto',
            borderBottom: '1px solid var(--rule-strong)',
          }}
        >
          <span className="type-label-sm text-ink">Img</span>
          <span className="type-label-sm text-ink">SKU · Name</span>
          <span className="type-label-sm text-ink">Brand</span>
          <span className="type-label-sm text-ink text-right">Retail</span>
          <span className="type-label-sm text-ink text-right">Cost</span>
          <span className="type-label-sm text-ink text-right">Margin</span>
          <span className="type-label-sm text-ink">Stock</span>
          <span className="type-label-sm text-ink">Active</span>
        </div>
        {rows.map((p) => {
          const url = pickPrimary(p.product_images);
          const thumb = url ? bcImage(url, 'card') : null;
          const retail = Number(p.retail_price);
          const cost = p.wholesale_cost != null ? Number(p.wholesale_cost) : null;
          return (
            <Link
              key={p.id}
              href={`/admin/products/${p.id}`}
              className="grid items-center gap-4 px-4 py-3 hover:bg-paper-2 transition-colors duration-150"
              style={{
                gridTemplateColumns: '48px 1fr minmax(140px,auto) minmax(80px,auto) minmax(80px,auto) minmax(60px,auto) auto auto',
                borderBottom: '1px solid var(--rule)',
                minHeight: 56,
              }}
            >
              <div
                className="relative overflow-hidden"
                style={{
                  width: 40,
                  height: 40,
                  border: '1px solid var(--rule)',
                  background:
                    'radial-gradient(ellipse at center, var(--color-cream) 0%, var(--color-paper-2) 115%)',
                }}
              >
                {thumb ? (
                  <Image
                    src={thumb}
                    alt=""
                    width={80}
                    height={80}
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
                <p
                  className="font-display text-ink truncate"
                  style={{ fontSize: '13.5px' }}
                >
                  {p.name}
                </p>
              </div>
              <span className="font-display text-ink truncate">{p.brands?.name ?? '—'}</span>
              <span
                className="font-display text-ink text-right"
                style={{ fontSize: '13.5px' }}
              >
                {fmt(p.retail_price)}
              </span>
              <span className="type-data-mono text-ink-muted text-right">
                {cost !== null ? fmt(cost) : '—'}
              </span>
              <span
                className="type-data-mono text-right"
                style={{
                  color: cost !== null ? 'var(--color-forest)' : 'var(--color-ink-muted)',
                }}
              >
                {margin(retail, cost)}
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
