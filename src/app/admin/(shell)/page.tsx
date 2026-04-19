import Link from 'next/link';
import {
  loadDashSummary,
  loadRevenueSeries,
  loadTopProducts,
  loadLtvBuckets,
  loadStockAlerts,
  loadCohortRetention,
  loadBrandBreakdown,
  loadStateBreakdown,
} from '@/lib/admin/analytics';
import { RevenueOverTime } from '@/components/admin/charts/RevenueOverTime';
import { TopProducts } from '@/components/admin/charts/TopProducts';
import { LtvHistogram } from '@/components/admin/charts/LtvHistogram';
import { OrdersAov } from '@/components/admin/charts/OrdersAov';
import { StockAlerts } from '@/components/admin/charts/StockAlerts';
import { CohortHeatmap } from '@/components/admin/charts/CohortHeatmap';
import { BrandTreemap } from '@/components/admin/charts/BrandTreemap';
import { GeographicBreakdown } from '@/components/admin/charts/GeographicBreakdown';

export const dynamic = 'force-dynamic';

function fmtMoney(v: number): string {
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Admin dashboard — editorial command center.
 *
 * 8 analytics widgets load in parallel. Page is a server component so
 * every render fetches fresh data; client-side auto-refresh can come in
 * a follow-up (for now the shell supports hard-refresh + fast revalidation).
 */
export default async function AdminDashboardPage() {
  const [summary, revenue, topProducts, ltv, stock, cohorts, brands, states] =
    await Promise.all([
      loadDashSummary(),
      loadRevenueSeries(90),
      loadTopProducts(20),
      loadLtvBuckets(),
      loadStockAlerts(),
      loadCohortRetention(),
      loadBrandBreakdown(),
      loadStateBreakdown(),
    ]);

  return (
    <>
      <header className="mb-8 pb-6" style={{ borderBottom: '1px solid var(--rule-strong)' }}>
        <div className="flex items-baseline justify-between gap-8 flex-wrap">
          <div className="min-w-0">
            <p className="type-label text-accent mb-3">§ Dashboard — Est. MMIII</p>
            <h1
              className="font-display text-ink"
              style={{
                fontSize: '44px',
                lineHeight: 1,
                letterSpacing: '-0.028em',
                fontWeight: 400,
              }}
            >
              La Costa <em className="type-accent">Command</em>.
            </h1>
            <p className="type-data-mono text-ink-muted mt-4">
              Today&rsquo;s trading floor · live Supabase · hard-refresh for latest
            </p>
          </div>

          <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2">
            <TinyStat
              label="Today"
              value={fmtMoney(summary.todaysRevenue)}
              delta={
                summary.revenueDelta > 0
                  ? `+${fmtMoney(summary.revenueDelta)}`
                  : summary.revenueDelta < 0
                    ? fmtMoney(summary.revenueDelta)
                    : '—'
              }
              positive={summary.revenueDelta > 0}
            />
            <TinyStat
              label="Orders 24h"
              value={String(summary.ordersLast24h)}
              delta={
                summary.ordersDeltaPct !== 0
                  ? `${summary.ordersDeltaPct > 0 ? '+' : ''}${summary.ordersDeltaPct}%`
                  : '—'
              }
              positive={summary.ordersDeltaPct > 0}
            />
            <TinyStat
              label="Pending ship"
              value={summary.unfulfilledCount.toLocaleString()}
              delta="needs action"
              href="/admin/orders?status=paid&fulfillment=unfulfilled"
            />
            <TinyStat
              label="Customers"
              value={summary.customerCount.toLocaleString()}
              delta="on file"
              href="/admin/customers"
            />
          </div>
        </div>
      </header>

      <section className="mb-6">
        <RevenueOverTime series={revenue} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_1fr] mb-6">
        <OrdersAov series={revenue} />
        <TopProducts products={topProducts} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1.4fr] mb-6">
        <LtvHistogram buckets={ltv} />
        <CohortHeatmap cohorts={cohorts} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2 mb-6">
        <BrandTreemap brands={brands} />
        <GeographicBreakdown states={states} />
      </section>

      <section className="mb-6">
        <StockAlerts alerts={stock} />
      </section>

      <p className="type-data-mono text-ink-muted text-center py-6">
        Lifetime revenue on file · {fmtMoney(summary.lifetimeRevenue)} · avg AOV
        (30d) · {fmtMoney(summary.aovLast30d)}
      </p>
    </>
  );
}

function TinyStat({
  label,
  value,
  delta,
  positive,
  href,
}: {
  label: string;
  value: string;
  delta?: string;
  positive?: boolean;
  href?: string;
}) {
  const body = (
    <div
      className="bg-cream"
      style={{
        border: '1px solid var(--rule)',
        padding: '10px 14px',
        minWidth: 140,
      }}
    >
      <p className="type-label-sm text-ink-muted mb-2">{label}</p>
      <p
        className="font-display italic text-brand-deep"
        style={{
          fontSize: '22px',
          lineHeight: 1,
          letterSpacing: '-0.018em',
          fontWeight: 500,
        }}
      >
        {value}
      </p>
      {delta && (
        <p
          className="type-data-mono mt-2"
          style={{
            color:
              positive === true
                ? 'var(--color-forest)'
                : positive === false
                  ? 'var(--color-accent)'
                  : 'var(--color-ink-muted)',
          }}
        >
          {delta}
        </p>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="hover:opacity-90 transition-opacity">
      {body}
    </Link>
  ) : (
    body
  );
}
