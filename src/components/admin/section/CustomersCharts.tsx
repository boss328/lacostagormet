'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type {
  AcquisitionPoint,
  LtvSlice,
  TopSpender,
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

function ChartTile({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="bg-paper"
      style={{ border: '1px solid var(--rule)', padding: '14px 16px', minHeight: 220 }}
    >
      <p className="type-label-sm text-ink-muted mb-3">{title}</p>
      {children}
    </div>
  );
}

export function CustomersCharts({
  acquisition,
  ltvBuckets,
  topSpenders,
}: {
  acquisition: AcquisitionPoint[];
  ltvBuckets: LtvSlice[];
  topSpenders: TopSpender[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartTile title="New vs returning (orders)">
        {acquisition.length === 0 ? (
          <Empty />
        ) : (
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={acquisition} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
                <CartesianGrid stroke="rgba(26,17,10,0.06)" strokeDasharray="3 6" vertical={false} />
                <XAxis dataKey="bucket" tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--rule)' }} minTickGap={36} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} width={32} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-ink-muted)' }} />
                <Bar dataKey="newCustomers" stackId="a" fill="var(--color-brand-deep)" name="new" />
                <Bar dataKey="returning" stackId="a" fill="var(--color-gold)" name="returning" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartTile>

      <ChartTile title="LTV distribution (lifetime)">
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ltvBuckets} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
              <CartesianGrid stroke="rgba(26,17,10,0.06)" strokeDasharray="3 6" vertical={false} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--rule)' }} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} width={32} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="count" fill="var(--color-brand-deep)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartTile>

      <ChartTile title="Top 10 spenders (lifetime)">
        {topSpenders.length === 0 ? (
          <Empty />
        ) : (
          <ul className="flex flex-col">
            {topSpenders.map((s, i) => (
              <li
                key={s.email}
                className="grid items-baseline gap-3 py-1.5"
                style={{
                  gridTemplateColumns: 'auto 1fr auto auto',
                  borderBottom: i === topSpenders.length - 1 ? 'none' : '1px solid var(--rule)',
                }}
              >
                <span className="type-data-mono text-ink-muted" style={{ width: 22 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="type-label-sm text-ink-2 truncate">{s.email}</span>
                <span className="type-data-mono text-ink-muted">{s.orders}o</span>
                <span
                  className="font-display italic text-brand-deep"
                  style={{ fontSize: '14px', fontWeight: 500 }}
                >
                  ${s.total.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ChartTile>

      <ChartTile title="LTV pareto">
        {topSpenders.length === 0 ? (
          <Empty />
        ) : (
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topSpenders.slice(0, 10).map((s, i) => ({ rank: `#${i + 1}`, total: s.total }))} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                <CartesianGrid stroke="rgba(26,17,10,0.06)" strokeDasharray="3 6" vertical={false} />
                <XAxis dataKey="rank" tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--rule)' }} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => `$${Number(v ?? 0).toLocaleString()}`} />
                <Bar dataKey="total" fill="var(--color-brand-deep)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartTile>
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
