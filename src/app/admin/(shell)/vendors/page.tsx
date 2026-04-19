import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type VendorRow = {
  id: string;
  name: string;
  contact_email: string | null;
  contact_name: string | null;
  terms: string | null;
  is_active: boolean;
  is_self_fulfilled: boolean;
  productCount: number;
  warehouseCount: number;
  openPoCount: number;
};

export default async function AdminVendorsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const search = typeof searchParams.q === 'string' ? searchParams.q : undefined;
  const admin = createAdminClient();

  let vq = admin
    .from('vendors')
    .select('id, name, contact_email, contact_name, terms, is_active, is_self_fulfilled')
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .limit(200);
  if (search) vq = vq.ilike('name', `%${search}%`);

  const { data: vendorsData } = await vq;
  const vendors = (vendorsData ?? []) as Array<Omit<VendorRow, 'productCount' | 'warehouseCount' | 'openPoCount'>>;

  // Count helpers — one round-trip each, all in parallel.
  const enriched: VendorRow[] = await Promise.all(
    vendors.map(async (v) => {
      const [prod, wh, po] = await Promise.all([
        admin
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('preferred_vendor_id', v.id)
          .eq('is_active', true),
        admin
          .from('vendor_warehouses')
          .select('id', { count: 'exact', head: true })
          .eq('vendor_id', v.id),
        admin
          .from('vendor_orders')
          .select('id', { count: 'exact', head: true })
          .eq('vendor_id', v.id)
          .in('status', ['pending', 'sent', 'confirmed']),
      ]);
      return {
        ...v,
        productCount: prod.count ?? 0,
        warehouseCount: wh.count ?? 0,
        openPoCount: po.count ?? 0,
      };
    }),
  );

  return (
    <>
      <header className="mb-8 pb-6" style={{ borderBottom: '1px solid var(--rule-strong)' }}>
        <p className="type-label text-accent mb-3">§ V. Vendors</p>
        <div className="flex items-baseline justify-between gap-6 flex-wrap">
          <h1
            className="font-display text-ink"
            style={{ fontSize: '40px', lineHeight: 1, letterSpacing: '-0.026em', fontWeight: 400 }}
          >
            The <em className="type-accent">supply ledger</em>.
          </h1>
          <div className="flex items-center gap-5">
            <Link
              href="/admin/vendors/new/"
              className="type-label-sm text-cream"
              style={{ padding: '10px 18px', background: 'var(--color-ink)' }}
            >
              + Add Vendor
            </Link>
            <span className="type-data-mono text-ink-muted">
              {enriched.length.toLocaleString()} on file
            </span>
          </div>
        </div>
      </header>

      <form method="GET" action="/admin/vendors/" className="flex items-center gap-3 mb-6 flex-wrap">
        <input
          type="search"
          name="q"
          placeholder="Vendor name"
          defaultValue={search ?? ''}
          className="bg-cream text-ink font-display flex-1 min-w-[240px]"
          style={{ border: '1px solid var(--rule-strong)', padding: '10px 14px', fontSize: '14px', minHeight: 40 }}
        />
        <button
          type="submit"
          className="type-label-sm text-ink"
          style={{ padding: '10px 18px', border: '1px solid var(--color-ink)', background: 'var(--color-cream)' }}
        >
          Search
        </button>
        {search && (
          <Link href="/admin/vendors/" className="type-label-sm text-ink-muted hover:text-accent">Clear</Link>
        )}
      </form>

      {enriched.length === 0 ? (
        <div className="bg-paper-2 text-center px-10 py-20" style={{ border: '1px solid var(--rule)' }}>
          <p
            className="font-display italic text-brand-deep mb-4"
            style={{ fontSize: '24px', letterSpacing: '-0.02em' }}
          >
            No vendors on file yet.
          </p>
          <p className="type-data-mono text-ink-muted">
            Add your first vendor to start auto-drafting purchase orders.
          </p>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--rule)', background: 'var(--color-cream)' }}>
          <div
            className="grid items-center gap-4 px-5 py-4 bg-paper-2"
            style={{
              gridTemplateColumns: 'minmax(200px,1.4fr) minmax(220px,1fr) auto auto auto auto',
              borderBottom: '1px solid var(--rule-strong)',
            }}
          >
            <span className="type-label-sm text-ink">Vendor</span>
            <span className="type-label-sm text-ink">Contact</span>
            <span className="type-label-sm text-ink text-right">Products</span>
            <span className="type-label-sm text-ink text-right">Warehouses</span>
            <span className="type-label-sm text-ink text-right">Open POs</span>
            <span className="type-label-sm text-ink text-right">Terms</span>
          </div>
          {enriched.map((v) => (
            <Link
              key={v.id}
              href={`/admin/vendors/${v.id}/`}
              className="grid items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-cream"
              style={{
                gridTemplateColumns: 'minmax(200px,1.4fr) minmax(220px,1fr) auto auto auto auto',
                borderBottom: '1px solid var(--rule)',
                minHeight: 56,
              }}
            >
              <span>
                <p
                  className="font-display italic text-brand-deep"
                  style={{ fontSize: '15.5px', fontWeight: 500, letterSpacing: '-0.015em' }}
                >
                  {v.name}
                </p>
                {v.is_self_fulfilled && (
                  <p className="type-data-mono text-ink-muted">self-fulfilled</p>
                )}
              </span>
              <span className="font-display text-ink-2 truncate" style={{ fontSize: '13.5px' }}>
                {v.contact_email ?? '—'}
              </span>
              <span className="type-data-mono text-ink-2 text-right">{v.productCount}</span>
              <span className="type-data-mono text-ink-2 text-right">{v.warehouseCount}</span>
              <span
                className="type-data-mono text-right"
                style={{ color: v.openPoCount > 0 ? 'var(--color-brand-deep)' : 'var(--color-ink-muted)' }}
              >
                {v.openPoCount}
              </span>
              <span className="type-data-mono text-ink-muted text-right">{v.terms ?? '—'}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
