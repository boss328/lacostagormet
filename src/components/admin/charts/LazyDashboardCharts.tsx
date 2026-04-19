'use client';

import dynamic from 'next/dynamic';

/**
 * Dashboard widgets that depend on recharts get a separate code-split
 * chunk. ssr:false because recharts' ResponsiveContainer relies on
 * window measurement that isn't meaningful at SSR — and the dashboard is
 * gated behind login so initial paint speed matters less than CLS-free
 * progressive hydration.
 *
 * Skeleton frames preserve the editorial widget chrome so the layout
 * doesn't jump while the chunk fetches.
 */

const Skeleton = ({ height = 240 }: { height?: number }) => (
  <div
    className="bg-cream"
    style={{
      border: '1px solid var(--rule-strong)',
      padding: '24px 26px',
      minHeight: height + 100,
    }}
  >
    <div
      className="bg-paper-2 flex items-center justify-center"
      style={{ height, border: '1px dashed var(--rule)' }}
    >
      <span className="type-data-mono text-ink-muted">Loading…</span>
    </div>
  </div>
);

export const RevenueOverTime = dynamic(
  () => import('@/components/admin/charts/RevenueOverTime').then((m) => m.RevenueOverTime),
  { ssr: false, loading: () => <Skeleton height={240} /> },
);

export const OrdersAov = dynamic(
  () => import('@/components/admin/charts/OrdersAov').then((m) => m.OrdersAov),
  { ssr: false, loading: () => <Skeleton height={220} /> },
);

export const LtvHistogram = dynamic(
  () => import('@/components/admin/charts/LtvHistogram').then((m) => m.LtvHistogram),
  { ssr: false, loading: () => <Skeleton height={220} /> },
);
