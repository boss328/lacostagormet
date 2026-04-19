'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';
import type {
  OrdersVolumePoint,
  StatusSlice,
  FulfillmentTimeBucket,
} from '@/lib/admin/section-analytics';

const PALETTE = [
  'var(--color-brand-deep)',
  'var(--color-gold)',
  'var(--color-forest)',
  'var(--color-accent)',
  'var(--color-ink-muted)',
];

const TOOLTIP_STYLE: React.CSSProperties = {
  background: 'var(--color-cream)',
  border: '1px solid var(--rule-strong)',
  borderRadius: 0,
  fontFamily: 'var(--font-mono)',
  fontSize: '11px',
};

function fmtMoney(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

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

export function OrdersCharts({
  volume,
  statuses,
  shipTimes,
}: {
  volume: OrdersVolumePoint[];
  statuses: StatusSlice[];
  shipTimes: FulfillmentTimeBucket[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartTile title="Order volume + revenue">
        {volume.length === 0 ? (
          <Empty />
        ) : (
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={volume} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
                <CartesianGrid stroke="rgba(26,17,10,0.06)" strokeDasharray="3 6" vertical={false} />
                <XAxis dataKey="bucket" tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--rule)' }} minTickGap={36} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis yAxisId="o" tick={axisTick} tickLine={false} axisLine={false} width={32} />
                <YAxis yAxisId="r" orientation="right" tick={axisTick} tickLine={false} axisLine={false} tickFormatter={fmtMoney} width={48} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => name === 'revenue' ? `$${Number(v ?? 0).toFixed(2)}` : String(v ?? '')} />
                <Line yAxisId="o" type="monotone" dataKey="orders" stroke="var(--color-brand-deep)" strokeWidth={1.6} dot={false} />
                <Line yAxisId="r" type="monotone" dataKey="revenue" stroke="var(--color-gold)" strokeWidth={1.4} strokeDasharray="3 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartTile>

      <ChartTile title="Status breakdown">
        {statuses.length === 0 ? (
          <Empty />
        ) : (
          <div className="grid grid-cols-[1fr_auto] items-center gap-4">
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statuses} dataKey="count" nameKey="status" innerRadius={42} outerRadius={72} paddingAngle={1}>
                    {statuses.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="var(--color-cream)" />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex flex-col gap-1.5 min-w-0">
              {statuses.map((s, i) => (
                <li key={s.status} className="flex items-baseline gap-2">
                  <span style={{ width: 8, height: 8, background: PALETTE[i % PALETTE.length], display: 'inline-block' }} />
                  <span className="type-label-sm text-ink-2 truncate">{s.status.replace(/_/g, ' ')}</span>
                  <span className="type-data-mono text-ink-muted ml-auto">{s.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </ChartTile>

      <ChartTile title="Time to ship (paid → fulfilled)">
        {shipTimes.every((b) => b.count === 0) ? (
          <Empty caption="No shipped orders in this window" />
        ) : (
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={shipTimes} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
                <CartesianGrid stroke="rgba(26,17,10,0.06)" strokeDasharray="3 6" vertical={false} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--rule)' }} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} width={32} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="count" fill="var(--color-brand-deep)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartTile>

      <ChartTile title="AOV trend">
        {volume.length === 0 ? (
          <Empty />
        ) : (
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={volume.map((p) => ({
                  bucket: p.bucket,
                  aov: p.orders > 0 ? Math.round((p.revenue / p.orders) * 100) / 100 : 0,
                }))}
                margin={{ top: 4, right: 8, bottom: 0, left: -22 }}
              >
                <CartesianGrid stroke="rgba(26,17,10,0.06)" strokeDasharray="3 6" vertical={false} />
                <XAxis dataKey="bucket" tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--rule)' }} minTickGap={36} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={fmtMoney} width={48} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => `$${Number(v ?? 0).toFixed(2)}`} />
                <Line type="monotone" dataKey="aov" stroke="var(--color-forest)" strokeWidth={1.6} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartTile>
    </div>
  );
}

const axisTick = {
  fill: 'var(--color-ink-muted)',
  fontSize: 10,
  fontFamily: 'var(--font-mono)',
} as const;

function Empty({ caption = 'No data in this range' }: { caption?: string }) {
  return (
    <div
      className="flex items-center justify-center text-ink-muted type-data-mono"
      style={{ height: 180 }}
    >
      {caption}
    </div>
  );
}
