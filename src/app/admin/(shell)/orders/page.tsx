import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

type OrderRow = {
  order_number: string;
  status: string;
  fulfillment_status: string;
  customer_email: string;
  total: number | string;
  created_at: string;
};

function fmtMoney(v: number | string): string {
  const n = typeof v === 'string' ? Number(v) : v;
  return `$${n.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function buildHref(current: Record<string, string | undefined>, overrides: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...overrides })) {
    if (v) qs.set(k, v);
  }
  const s = qs.toString();
  return s ? `/admin/orders?${s}` : '/admin/orders';
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const statusParam =
    typeof searchParams.status === 'string' ? searchParams.status : undefined;
  const search = typeof searchParams.q === 'string' ? searchParams.q : undefined;
  const page = Math.max(1, Number(searchParams.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const admin = createAdminClient();
  let q = admin
    .from('orders')
    .select('order_number, status, fulfillment_status, customer_email, total, created_at', {
      count: 'exact',
    });

  if (statusParam && statusParam !== 'all') {
    q = q.eq('status', statusParam);
  }
  if (search) {
    q = q.or(`order_number.ilike.%${search}%,customer_email.ilike.%${search}%`);
  }
  q = q.order('created_at', { ascending: false }).range(offset, offset + PAGE_SIZE - 1);

  const { data, count } = await q;
  const rows = (data ?? []) as OrderRow[];
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const currentParams = {
    status: statusParam,
    q: search,
    page: page > 1 ? String(page) : undefined,
  };

  return (
    <>
      <header className="mb-8">
        <p className="type-label text-accent mb-3">§ Orders</p>
        <h1 className="type-display-2">All orders.</h1>
        <p className="type-data-mono text-ink-muted mt-3">
          {total.toLocaleString()} {total === 1 ? 'order' : 'orders'} matching filters
        </p>
      </header>

      {/* Filters */}
      <form
        method="GET"
        action="/admin/orders"
        className="flex items-center gap-4 mb-6 flex-wrap"
      >
        <select
          name="status"
          defaultValue={statusParam ?? 'all'}
          className="bg-cream text-ink font-display"
          style={{
            border: '1px solid var(--rule-strong)',
            padding: '10px 14px',
            fontSize: '14px',
            minHeight: 44,
          }}
        >
          <option value="all">All statuses</option>
          <option value="paid">Paid</option>
          <option value="payment_held">Held for review</option>
          <option value="cancelled">Cancelled</option>
          <option value="refunded">Refunded</option>
          <option value="pending">Pending</option>
        </select>
        <input
          type="search"
          name="q"
          placeholder="Order number or email"
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
          <span>Apply</span>
          <span className="btn-arrow" aria-hidden="true">→</span>
        </button>
        {(statusParam || search) && (
          <Link
            href="/admin/orders"
            className="type-label text-ink-muted hover:text-accent transition-colors duration-200"
          >
            Clear
          </Link>
        )}
      </form>

      {/* Table */}
      {rows.length === 0 ? (
        <div
          className="bg-paper-2 text-center px-10 py-16"
          style={{ border: '1px solid var(--rule)' }}
        >
          <p
            className="font-display italic text-brand-deep"
            style={{ fontSize: '22px', letterSpacing: '-0.02em' }}
          >
            No orders match those filters.
          </p>
        </div>
      ) : (
        <div
          style={{
            border: '1px solid var(--rule)',
            background: 'var(--color-cream)',
          }}
        >
          <div
            className="grid items-center gap-4 px-4 py-3 bg-paper-2"
            style={{
              gridTemplateColumns: 'minmax(140px,auto) minmax(260px,1fr) auto auto auto auto',
              borderBottom: '1px solid var(--rule-strong)',
            }}
          >
            <span className="type-label-sm text-ink">Order</span>
            <span className="type-label-sm text-ink">Customer</span>
            <span className="type-label-sm text-ink">Date</span>
            <span className="type-label-sm text-ink">Status</span>
            <span className="type-label-sm text-ink">Fulfilment</span>
            <span className="type-label-sm text-ink text-right">Total</span>
          </div>
          {rows.map((o) => (
            <Link
              key={o.order_number}
              href={`/admin/orders/${o.order_number}`}
              className="grid items-center gap-4 px-4 py-3 hover:bg-paper-2 transition-colors duration-200"
              style={{
                gridTemplateColumns: 'minmax(140px,auto) minmax(260px,1fr) auto auto auto auto',
                borderBottom: '1px solid var(--rule)',
                minHeight: 48,
              }}
            >
              <span
                className="font-display italic text-brand-deep"
                style={{ fontSize: '15px', fontWeight: 500, letterSpacing: '-0.015em' }}
              >
                {o.order_number}
              </span>
              <span className="font-display text-ink truncate">{o.customer_email}</span>
              <span className="type-data-mono text-ink-muted">{fmtDate(o.created_at)}</span>
              <StatusPill value={o.status} />
              <span className="type-data-mono text-ink">{o.fulfillment_status.replace(/_/g, ' ')}</span>
              <span className="font-display text-ink text-right" style={{ fontSize: '15px' }}>
                {fmtMoney(o.total)}
              </span>
            </Link>
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between pt-6">
          {page > 1 ? (
            <Link
              href={buildHref(currentParams, { page: page > 2 ? String(page - 1) : undefined })}
              className="type-label text-ink hover:text-brand-deep transition-colors duration-200"
            >
              ←&nbsp;Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="type-data-mono text-ink-muted">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link
              href={buildHref(currentParams, { page: String(page + 1) })}
              className="type-label text-ink hover:text-brand-deep transition-colors duration-200"
            >
              Older&nbsp;→
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </>
  );
}

function StatusPill({ value }: { value: string }) {
  const bg =
    value === 'paid'
      ? 'var(--color-forest)'
      : value === 'payment_held'
        ? 'var(--color-gold)'
        : value === 'cancelled'
          ? 'var(--color-accent)'
          : 'var(--color-ink-muted)';
  return (
    <span
      className="type-label-sm text-cream"
      style={{ padding: '4px 8px', background: bg }}
    >
      {value.replace(/_/g, ' ')}
    </span>
  );
}
