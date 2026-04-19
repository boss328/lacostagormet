import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { STATUS_LABEL, STATUS_COLOR, type VendorOrderStatus } from '@/lib/admin/vendor-po';

export const dynamic = 'force-dynamic';

const STATUSES: Array<{ key: 'all' | VendorOrderStatus; label: string }> = [
  { key: 'pending', label: 'Drafts' },
  { key: 'sent', label: 'Sent' },
  { key: 'confirmed', label: 'Acknowledged' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'all', label: 'All' },
];

type PoRow = {
  id: string;
  status: VendorOrderStatus;
  email_subject: string | null;
  total_wholesale: number | string | null;
  created_at: string;
  email_sent_at: string | null;
  warehouse: { label: string } | null;
  vendor: { name: string } | null;
  order: { order_number: string; customer_email: string } | null;
  itemCount: number;
};

function buildHref(base: string, params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const statusKey = (typeof searchParams.status === 'string' ? searchParams.status : 'pending') as
    | 'all'
    | VendorOrderStatus;
  const admin = createAdminClient();

  let q = admin
    .from('vendor_orders')
    .select(
      'id, status, email_subject, total_wholesale, created_at, email_sent_at, vendor:vendors(name), order:orders(id, order_number, customer_email), warehouse:vendor_warehouses(label)',
    )
    .order('created_at', { ascending: false })
    .limit(200);
  if (statusKey !== 'all') q = q.eq('status', statusKey);

  const { data: posData } = await q;
  const pos = (posData ?? []) as unknown as Array<Omit<PoRow, 'itemCount'> & { order: { id: string; order_number: string; customer_email: string } | null }>;

  // Fetch item counts per PO via order_items where order_id + assigned_vendor_id matches
  const enriched: PoRow[] = await Promise.all(
    pos.map(async (p) => {
      let count = 0;
      if (p.order?.id) {
        const { count: c } = await admin
          .from('order_items')
          .select('id', { count: 'exact', head: true })
          .eq('order_id', p.order.id);
        count = c ?? 0;
      }
      return { ...p, itemCount: count };
    }),
  );

  return (
    <>
      <header className="mb-8 pb-6" style={{ borderBottom: '1px solid var(--rule-strong)' }}>
        <p className="type-label text-accent mb-3">§ VI. Purchase Orders</p>
        <div className="flex items-baseline justify-between gap-6 flex-wrap">
          <h1
            className="font-display text-ink"
            style={{ fontSize: '40px', lineHeight: 1, letterSpacing: '-0.026em' }}
          >
            The <em className="type-accent">drop-ship desk</em>.
          </h1>
          <span className="type-data-mono text-ink-muted">
            {enriched.length.toLocaleString()} on this view
          </span>
        </div>
      </header>

      <div className="flex items-center gap-1.5 mb-6 flex-wrap">
        {STATUSES.map((s) => {
          const active = s.key === statusKey;
          return (
            <Link
              key={s.key}
              href={buildHref('/admin/purchase-orders/', { status: s.key === 'pending' ? undefined : s.key })}
              className="type-label-sm transition-colors duration-200"
              style={{
                padding: '6px 11px',
                border: '1px solid',
                borderColor: active ? 'var(--color-ink)' : 'var(--rule-strong)',
                background: active ? 'var(--color-ink)' : 'transparent',
                color: active ? 'var(--color-cream)' : 'var(--color-ink-2)',
              }}
            >
              {s.label}
            </Link>
          );
        })}
      </div>

      {enriched.length === 0 ? (
        <div className="bg-paper-2 text-center px-10 py-20" style={{ border: '1px solid var(--rule)' }}>
          <p
            className="font-display italic text-brand-deep"
            style={{ fontSize: '24px', letterSpacing: '-0.02em' }}
          >
            {statusKey === 'pending' ? 'No drafts waiting on you.' : 'No POs in this view.'}
          </p>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--rule)', background: 'var(--color-cream)' }}>
          <div
            className="grid items-center gap-4 px-5 py-4 bg-paper-2"
            style={{
              gridTemplateColumns:
                'minmax(140px,auto) minmax(200px,1fr) minmax(180px,1fr) auto auto auto auto',
              borderBottom: '1px solid var(--rule-strong)',
            }}
          >
            <span className="type-label-sm text-ink">Order</span>
            <span className="type-label-sm text-ink">Customer</span>
            <span className="type-label-sm text-ink">Vendor · Warehouse</span>
            <span className="type-label-sm text-ink text-right">Items</span>
            <span className="type-label-sm text-ink text-right">Wholesale</span>
            <span className="type-label-sm text-ink">Status</span>
            <span className="type-label-sm text-ink text-right">Created</span>
          </div>
          {enriched.map((p) => (
            <Link
              key={p.id}
              href={`/admin/purchase-orders/${p.id}/`}
              className="grid items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-cream"
              style={{
                gridTemplateColumns:
                  'minmax(140px,auto) minmax(200px,1fr) minmax(180px,1fr) auto auto auto auto',
                borderBottom: '1px solid var(--rule)',
                minHeight: 56,
              }}
            >
              <span
                className="font-display italic text-brand-deep"
                style={{ fontSize: '15px', fontWeight: 500 }}
              >
                {p.order?.order_number ?? '—'}
              </span>
              <span className="font-display text-ink truncate" style={{ fontSize: '13.5px' }}>
                {p.order?.customer_email ?? '—'}
              </span>
              <span className="font-display text-ink truncate" style={{ fontSize: '13.5px' }}>
                {p.vendor?.name ?? '—'}
                {p.warehouse?.label && (
                  <span className="type-data-mono text-ink-muted ml-2">· {p.warehouse.label}</span>
                )}
              </span>
              <span className="type-data-mono text-ink-2 text-right">{p.itemCount}</span>
              <span className="type-data-mono text-ink text-right">
                {p.total_wholesale != null ? `$${Number(p.total_wholesale).toFixed(2)}` : '—'}
              </span>
              <span
                className="type-label-sm text-cream"
                style={{ padding: '3px 8px', background: STATUS_COLOR[p.status] }}
              >
                {STATUS_LABEL[p.status]}
              </span>
              <span className="type-data-mono text-ink-muted text-right">
                {new Date(p.created_at).toLocaleDateString('en-US')}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
