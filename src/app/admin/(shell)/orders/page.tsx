import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseRange, resolveRange, fmtDelta } from '@/lib/admin/range';
import { loadOrdersSection } from '@/lib/admin/section-analytics';
import { SectionAnalytics, HeadlineStat } from '@/components/admin/section/SectionAnalytics';
import { OrdersCharts } from '@/components/admin/section/LazyCharts';

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

type FilterKey =
  | 'all'
  | 'paid'
  | 'pending-fulfillment'
  | 'payment_held'
  | 'cancelled'
  | 'high-value'
  | 'this-week';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Filter = {
  key: FilterKey;
  label: string;
  apply: (q: any) => any;
};

const FILTERS: Filter[] = [
  { key: 'all',          label: 'All',          apply: (q) => q },
  { key: 'paid',         label: 'Paid',         apply: (q) => q.eq('status', 'paid') },
  {
    key: 'pending-fulfillment',
    label: 'Pending fulfilment',
    apply: (q) => q.eq('status', 'paid').not('fulfillment_status', 'in', '(shipped,delivered)'),
  },
  { key: 'payment_held', label: 'Held for review',    apply: (q) => q.eq('status', 'payment_held') },
  { key: 'cancelled',    label: 'Cancelled',          apply: (q) => q.eq('status', 'cancelled') },
  { key: 'high-value',   label: 'High value ($500+)', apply: (q) => q.gte('total', 500) },
  {
    key: 'this-week',
    label: 'This week',
    apply: (q) => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      return q.gte('created_at', since);
    },
  },
];
/* eslint-enable @typescript-eslint/no-explicit-any */

function fmtMoney(v: number | string): string {
  const n = typeof v === 'string' ? Number(v) : v;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

function statusColor(status: string): string {
  switch (status) {
    case 'paid':          return 'var(--color-forest)';
    case 'payment_held':  return 'var(--color-gold)';
    case 'cancelled':     return 'var(--color-accent)';
    case 'refunded':      return 'var(--color-brand)';
    default:              return 'var(--color-ink-muted)';
  }
}

function buildHref(base: string, params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const filterKey = (
    typeof searchParams.view === 'string' ? searchParams.view : 'all'
  ) as FilterKey;
  const search = typeof searchParams.q === 'string' ? searchParams.q : undefined;
  const page = Math.max(1, Number(searchParams.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const rangeKey = parseRange(searchParams.range);
  const range = resolveRange(rangeKey);

  const admin = createAdminClient();
  const filter = FILTERS.find((f) => f.key === filterKey) ?? FILTERS[0];

  // Load list + analytics in parallel
  const [{ data, count }, section] = await Promise.all([
    (async () => {
      let q = admin
        .from('orders')
        .select(
          'order_number, status, fulfillment_status, customer_email, total, created_at',
          { count: 'exact' },
        );
      q = filter.apply(q) as typeof q;
      if (search) q = q.or(`order_number.ilike.%${search}%,customer_email.ilike.%${search}%`);
      q = q.order('created_at', { ascending: false }).range(offset, offset + PAGE_SIZE - 1);
      return q;
    })(),
    loadOrdersSection(range),
  ]);

  const rows = (data ?? []) as OrderRow[];
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const ordersDelta = fmtDelta(section.headline.ordersCount, section.headline.priorOrdersCount);
  const revenueDelta = fmtDelta(section.headline.revenue, section.headline.priorRevenue);
  const aovDelta = fmtDelta(section.headline.aov, section.headline.priorAov);

  return (
    <>
      <header className="mb-8 pb-6" style={{ borderBottom: '1px solid var(--rule-strong)' }}>
        <p className="type-label text-accent mb-3">§ II. Orders</p>
        <div className="flex items-baseline justify-between gap-6 flex-wrap">
          <h1
            className="font-display text-ink"
            style={{ fontSize: '40px', lineHeight: 1, letterSpacing: '-0.026em', fontWeight: 400 }}
          >
            The <em className="type-accent">ledger</em>.
          </h1>
          <div className="flex items-center gap-5">
            <Link
              href={buildHref('/api/admin/orders/export', {
                view: filterKey === 'all' ? undefined : filterKey,
                q: search,
              })}
              className="type-label-sm text-ink hover:text-brand-deep transition-colors duration-200"
            >
              Export CSV →
            </Link>
            <span className="type-data-mono text-ink-muted">
              {total.toLocaleString()} total
            </span>
          </div>
        </div>
      </header>

      <SectionAnalytics
        range={rangeKey}
        eyebrow="Orders Analytics"
        headline={
          <div className="grid gap-6 lg:grid-cols-4 max-sm:grid-cols-2">
            <HeadlineStat
              label={`Orders — ${range.short}`}
              value={section.headline.ordersCount.toLocaleString()}
              delta={ordersDelta.pct === null ? null : { label: ordersDelta.label, sign: ordersDelta.sign }}
              sub="vs prior"
            />
            <HeadlineStat
              label={`Revenue — ${range.short}`}
              value={fmtMoney(section.headline.revenue)}
              delta={revenueDelta.pct === null ? null : { label: revenueDelta.label, sign: revenueDelta.sign }}
              sub="vs prior"
            />
            <HeadlineStat
              label={`AOV — ${range.short}`}
              value={fmtMoney(section.headline.aov)}
              delta={aovDelta.pct === null ? null : { label: aovDelta.label, sign: aovDelta.sign }}
              sub="vs prior"
            />
            <HeadlineStat
              label="Pending fulfilment"
              value={section.statuses.find((s) => s.status === 'paid')?.count.toLocaleString() ?? '0'}
              sub="of paid orders"
            />
          </div>
        }
        charts={
          <OrdersCharts
            volume={section.volume}
            statuses={section.statuses}
            shipTimes={section.shipTimes}
          />
        }
      />

      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        {FILTERS.map((f) => {
          const active = f.key === filterKey;
          return (
            <Link
              key={f.key}
              href={buildHref('/admin/orders', {
                view: f.key === 'all' ? undefined : f.key,
                q: search,
                range: rangeKey === 'all' ? undefined : rangeKey,
              })}
              className="type-label-sm transition-colors duration-200"
              style={{
                padding: '6px 11px',
                border: '1px solid',
                borderColor: active ? 'var(--color-ink)' : 'var(--rule-strong)',
                background: active ? 'var(--color-ink)' : 'transparent',
                color: active ? 'var(--color-cream)' : 'var(--color-ink-2)',
              }}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <form
        method="GET"
        action="/admin/orders"
        className="flex items-center gap-3 mb-6 flex-wrap"
      >
        {filterKey !== 'all' && <input type="hidden" name="view" value={filterKey} />}
        {rangeKey !== 'all' && <input type="hidden" name="range" value={rangeKey} />}
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
            minHeight: 40,
          }}
        />
        <button
          type="submit"
          className="type-label-sm text-ink"
          style={{
            padding: '10px 18px',
            border: '1px solid var(--color-ink)',
            background: 'var(--color-cream)',
          }}
        >
          Search
        </button>
        {search && (
          <Link
            href={buildHref('/admin/orders', {
              view: filterKey === 'all' ? undefined : filterKey,
              range: rangeKey === 'all' ? undefined : rangeKey,
            })}
            className="type-label-sm text-ink-muted hover:text-accent transition-colors duration-200"
          >
            Clear
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <div
          className="bg-paper-2 text-center px-10 py-20"
          style={{ border: '1px solid var(--rule)' }}
        >
          <p
            className="font-display italic text-brand-deep"
            style={{ fontSize: '24px', letterSpacing: '-0.02em' }}
          >
            No orders match this view.
          </p>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--rule)', background: 'var(--color-cream)' }}>
          <div
            className="grid items-center gap-4 px-5 py-4 bg-paper-2"
            style={{
              gridTemplateColumns:
                'minmax(140px,auto) minmax(240px,1fr) minmax(110px,auto) auto auto minmax(100px,auto)',
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
              className="grid items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-cream"
              style={{
                gridTemplateColumns:
                  'minmax(140px,auto) minmax(240px,1fr) minmax(110px,auto) auto auto minmax(100px,auto)',
                borderBottom: '1px solid var(--rule)',
                minHeight: 56,
              }}
            >
              <span
                className="font-display italic text-brand-deep"
                style={{ fontSize: '15.5px', fontWeight: 500, letterSpacing: '-0.015em' }}
              >
                {o.order_number}
              </span>
              <span className="font-display text-ink truncate">{o.customer_email}</span>
              <span className="type-data-mono text-ink-muted">{fmtDate(o.created_at)}</span>
              <span
                className="type-label-sm text-cream"
                style={{ padding: '3px 8px', background: statusColor(o.status) }}
              >
                {o.status.replace(/_/g, ' ')}
              </span>
              <span className="type-data-mono text-ink-muted">
                {o.fulfillment_status.replace(/_/g, ' ')}
              </span>
              <span
                className="font-display text-ink text-right"
                style={{ fontSize: '14.5px' }}
              >
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
              href={buildHref('/admin/orders', {
                view: filterKey === 'all' ? undefined : filterKey,
                q: search,
                range: rangeKey === 'all' ? undefined : rangeKey,
                page: page > 2 ? String(page - 1) : undefined,
              })}
              className="type-label-sm text-ink hover:text-brand-deep"
            >
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="type-data-mono text-ink-muted">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link
              href={buildHref('/admin/orders', {
                view: filterKey === 'all' ? undefined : filterKey,
                q: search,
                range: rangeKey === 'all' ? undefined : rangeKey,
                page: String(page + 1),
              })}
              className="type-label-sm text-ink hover:text-brand-deep"
            >
              Older →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </>
  );
}
