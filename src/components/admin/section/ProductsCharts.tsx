'use client';

import { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type {
  TopSellingProduct,
  MarginSlice,
  NeverOrdered,
} from '@/lib/admin/section-analytics';

const TOOLTIP_STYLE: React.CSSProperties = {
  background: 'var(--color-cream)',
  border: '1px solid var(--rule-strong)',
  borderRadius: 0,
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
};

const axisTick = {
  fill: 'var(--color-ink-muted)',
  fontSize: 10,
  fontFamily: 'var(--font-mono)',
} as const;

function ChartTile({
  title,
  toggle,
  children,
}: {
  title: string;
  toggle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="bg-paper"
      style={{ border: '1px solid var(--rule)', padding: '14px 16px', minHeight: 220 }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p className="type-label-sm text-ink-muted">{title}</p>
        {toggle}
      </div>
      {children}
    </div>
  );
}

export function ProductsCharts({
  topSellers,
  marginBuckets,
  neverOrdered,
  brandPerformance,
}: {
  topSellers: TopSellingProduct[];
  marginBuckets: MarginSlice[];
  neverOrdered: NeverOrdered[];
  brandPerformance: Array<{ brand: string; revenue: number; units: number }>;
}) {
  const [topMode, setTopMode] = useState<'revenue' | 'units'>('revenue');
  const [brandMode, setBrandMode] = useState<'revenue' | 'units'>('revenue');
  const topData = topSellers.slice(0, 10);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartTile
        title="Top sellers"
        toggle={<ToggleButtons mode={topMode} setMode={setTopMode} />}
      >
        {topData.length === 0 ? (
          <Empty />
        ) : (
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topData}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
              >
                <CartesianGrid stroke="rgba(26,17,10,0.06)" strokeDasharray="3 6" horizontal={false} />
                <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v: number) => topMode === 'revenue' ? (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`) : String(v)} />
                <YAxis type="category" dataKey="sku" tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--rule)' }} width={84} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => topMode === 'revenue' ? `$${Number(v ?? 0).toFixed(2)}` : String(v ?? '')} labelFormatter={(label) => topData.find((p) => p.sku === label)?.name ?? String(label)} />
                <Bar dataKey={topMode} fill="var(--color-brand-deep)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartTile>

      <ChartTile title="Margin distribution">
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={marginBuckets} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
              <CartesianGrid stroke="rgba(26,17,10,0.06)" strokeDasharray="3 6" vertical={false} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--rule)' }} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} width={32} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="count" fill="var(--color-gold)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartTile>

      <ChartTile
        title="Brand performance"
        toggle={<ToggleButtons mode={brandMode} setMode={setBrandMode} />}
      >
        {brandPerformance.length === 0 ? (
          <Empty />
        ) : (
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={brandPerformance}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
              >
                <CartesianGrid stroke="rgba(26,17,10,0.06)" strokeDasharray="3 6" horizontal={false} />
                <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v: number) => brandMode === 'revenue' ? (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`) : String(v)} />
                <YAxis type="category" dataKey="brand" tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--rule)' }} width={120} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => brandMode === 'revenue' ? `$${Number(v ?? 0).toFixed(2)}` : String(v ?? '')} />
                <Bar dataKey={brandMode} fill="var(--color-brand-deep)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartTile>

      <ChartTile title={`Never-ordered products${neverOrdered.length > 0 ? ` (${neverOrdered.length}+ shown)` : ''}`}>
        {neverOrdered.length === 0 ? (
          <Empty caption="Every product has sold at least once. Nice." />
        ) : (
          <ul className="flex flex-col" style={{ maxHeight: 220, overflowY: 'auto' }}>
            {neverOrdered.map((p, i) => (
              <li
                key={p.sku}
                className="grid items-baseline gap-3 py-1.5"
                style={{
                  gridTemplateColumns: 'auto 1fr',
                  borderBottom: i === neverOrdered.length - 1 ? 'none' : '1px solid var(--rule)',
                }}
              >
                <span className="type-data-mono text-ink-muted" style={{ minWidth: 90 }}>
                  {p.sku}
                </span>
                <span className="font-display text-ink truncate" style={{ fontSize: '13px' }}>
                  {p.name}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ChartTile>
    </div>
  );
}

function ToggleButtons({
  mode,
  setMode,
}: {
  mode: 'revenue' | 'units';
  setMode: (m: 'revenue' | 'units') => void;
}) {
  return (
    <div className="flex items-center gap-3">
      {(['revenue', 'units'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          className="type-label-sm transition-colors duration-150"
          style={{
            color: mode === m ? 'var(--color-brand-deep)' : 'var(--color-ink-muted)',
            textDecoration: mode === m ? 'underline' : 'none',
            textUnderlineOffset: 4,
          }}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

function Empty({ caption = 'No data in this range' }: { caption?: string }) {
  return (
    <div
      className="flex items-center justify-center text-ink-muted type-data-mono"
      style={{ height: 200 }}
    >
      {caption}
    </div>
  );
}
