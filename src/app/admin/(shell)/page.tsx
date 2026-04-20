import Link from 'next/link';
import {
  loadDashSummary,
  loadRevenueSeriesForRange,
  loadTopProducts,
  loadLtvBuckets,
  loadStockAlerts,
  loadCohortRetention,
  loadBrandBreakdown,
  loadStateBreakdown,
} from '@/lib/admin/analytics';
import { parseRange, resolveRange } from '@/lib/admin/range';
import { RangePills } from '@/components/admin/RangePills';
// Recharts-using widgets are code-split into a separate client chunk so
// the dashboard route's First Load JS isn't dragging decimal.js + d3
// into the initial bundle.
import {
  RevenueOverTime,
  OrdersAov,
  LtvHistogram,
} from '@/components/admin/charts/LazyDashboardCharts';
import { TopProducts } from '@/components/admin/charts/TopProducts';
import { StockAlerts } from '@/components/admin/charts/StockAlerts';
import { CohortHeatmap } from '@/components/admin/charts/CohortHeatmap';
import { BrandTreemap } from '@/components/admin/charts/BrandTreemap';
import { GeographicBreakdown } from '@/components/admin/charts/GeographicBreakdown';

export const dynamic = 'force-dynamic';

function fmtMoney(v: number): string {
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const HERITAGE_YEARS = new Date().getFullYear() - 2003;

/**
 * Admin dashboard — editorial command center.
 *
 * Heritage strip leads (lifetime totals — what 22 years built).
 * Range pills then scope the live widgets that follow. Revenue,
 * AOV, top products, brands, geo all respect ?range=.
 * LTV + cohort retention stay lifetime — they're inherently
 * lifetime metrics and labeled as such.
 */
export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const rangeKey = parseRange(searchParams.range);
  const range = resolveRange(rangeKey);

  const [summary, revenue, topProducts, ltv, stock, cohorts, brands, states] =
    await Promise.all([
      loadDashSummary(),
      loadRevenueSeriesForRange(range),
      loadTopProducts(20),
      loadLtvBuckets(),
      loadStockAlerts(),
      loadCohortRetention(),
      loadBrandBreakdown(),
      loadStateBreakdown(),
    ]);

  return (
    <>
      <header className="mb-8 pb-6 max-md:mb-5 max-md:pb-4" style={{ borderBottom: '1px solid var(--rule-strong)' }}>
        <div className="flex items-baseline justify-between gap-8 flex-wrap max-md:gap-4">
          <div className="min-w-0">
            <p className="type-label text-accent mb-3 max-md:mb-2">§ I. Dashboard — Est. MMIII</p>
            <h1
              className="font-display text-ink max-md:!text-[22px]"
              style={{
                fontSize: '44px',
                lineHeight: 1,
                letterSpacing: '-0.028em',
                fontWeight: 400,
              }}
            >
              La Costa <em className="type-accent">Command</em>.
            </h1>
            <p className="type-data-mono text-ink-muted mt-4 max-md:mt-2">
              Today&rsquo;s trading floor · live Supabase · hard-refresh for latest
            </p>
          </div>

          <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-md:gap-2 w-full">
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
              href="/admin/orders/?status=paid&fulfillment=unfulfilled"
            />
            <TinyStat
              label="Customers"
              value={summary.customerCount.toLocaleString()}
              delta="on file"
              href="/admin/customers/"
            />
          </div>
        </div>
      </header>

      {/* HERITAGE — all-time totals, the bedrock the rest of the dashboard sits on */}
      <section
        className="mb-8 px-6 py-5 max-md:mb-5 max-md:px-4 max-md:py-3"
        style={{
          border: '1px solid var(--rule-strong)',
          background: 'var(--color-cream)',
        }}
      >
        <div className="flex items-baseline justify-between gap-6 mb-4 flex-wrap max-md:gap-2 max-md:mb-2">
          <div>
            <p className="type-label text-ink-muted mb-1 max-md:mb-0.5">§ Heritage</p>
            <p
              className="font-display italic text-brand-deep max-md:!text-[15px]"
              style={{ fontSize: '20px', lineHeight: 1, fontWeight: 500, letterSpacing: '-0.018em' }}
            >
              Est. MMIII — {HERITAGE_YEARS} years of history.
            </p>
          </div>
          <p className="type-data-mono text-ink-muted max-md:hidden">All-time, since 2003</p>
        </div>
        {/* Tighter vertical rhythm on mobile: gap-3 (12px) keeps each
            data point at ~56px including its label. */}
        <div className="grid gap-6 lg:grid-cols-4 max-md:grid-cols-2 max-md:gap-x-4 max-md:gap-y-3">
          <HeritageTile label="Revenue — all-time" value={fmtMoney(summary.lifetimeRevenue)} />
          <HeritageTile label="Orders — all-time" value={summary.orderCount.toLocaleString()} />
          <HeritageTile label="Customers — on file" value={summary.customerCount.toLocaleString()} />
          <HeritageTile label="AOV — last 30 days" value={fmtMoney(summary.aovLast30d)} />
        </div>
      </section>

      {/* TIME-RANGE STRIP */}
      <div className="flex items-baseline gap-4 flex-wrap mb-5 max-md:gap-2 max-md:mb-4">
        <p className="type-label text-ink-muted">§ Range</p>
        <RangePills active={rangeKey} />
        <span className="type-data-mono text-ink-muted max-md:hidden">
          Showing {range.short} · {range.grain} aggregation
        </span>
      </div>

      <section className="mb-6">
        <RevenueOverTime series={revenue} label={range.short} />
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

function HeritageTile({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="type-label-sm text-ink-muted mb-2 max-md:mb-1">{label}</p>
      <p
        className="font-display italic text-brand-deep max-md:!text-[22px]"
        style={{ fontSize: '28px', lineHeight: 1, fontWeight: 500, letterSpacing: '-0.022em' }}
      >
        {value}
      </p>
    </div>
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
    // max-md:min-h-[88px] forces all four tiles to the same height so
    // rows 1 and 2 of the 2x2 mobile grid stay visually aligned even
    // when delta strings differ in length ("—" vs "-100%" etc.).
    <div
      className="bg-cream max-md:!min-w-0 max-md:!p-3 max-md:min-h-[88px] max-md:flex max-md:flex-col max-md:justify-between"
      style={{
        border: '1px solid var(--rule)',
        padding: '10px 14px',
        minWidth: 140,
      }}
    >
      <p className="type-label-sm text-ink-muted mb-2 max-md:mb-1 max-md:!text-[9px]">{label}</p>
      <p
        className="font-display italic text-brand-deep max-md:!text-[20px]"
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
          className="type-data-mono mt-2 max-md:mt-1 max-md:!text-[10px]"
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
