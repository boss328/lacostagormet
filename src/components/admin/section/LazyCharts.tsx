'use client';

import dynamic from 'next/dynamic';

/**
 * Lazy-loaded chart bundles for the inner admin section pages.
 *
 * Each chart family (recharts-based) gets `ssr: false` so:
 *   1. The recharts code-split chunk doesn't ship in the page's First
 *      Load JS (it loads only after hydration when the section is open).
 *   2. The server-rendered HTML for the table-first page paints first;
 *      charts hydrate progressively.
 *
 * Loading sentinel keeps the layout from collapsing while the chunk
 * fetches.
 */

const ChartLoading = () => (
  <div
    className="bg-paper flex items-center justify-center"
    style={{ border: '1px solid var(--rule)', minHeight: 220, padding: '14px 16px' }}
  >
    <span className="type-data-mono text-ink-muted">Loading chart…</span>
  </div>
);

const ChartGridLoading = () => (
  <div className="grid gap-4 lg:grid-cols-2">
    <ChartLoading />
    <ChartLoading />
    <ChartLoading />
    <ChartLoading />
  </div>
);

export const OrdersCharts = dynamic(
  () => import('@/components/admin/section/OrdersCharts').then((m) => m.OrdersCharts),
  { ssr: false, loading: ChartGridLoading },
);

export const CustomersCharts = dynamic(
  () => import('@/components/admin/section/CustomersCharts').then((m) => m.CustomersCharts),
  { ssr: false, loading: ChartGridLoading },
);

export const ProductsCharts = dynamic(
  () => import('@/components/admin/section/ProductsCharts').then((m) => m.ProductsCharts),
  { ssr: false, loading: ChartGridLoading },
);
