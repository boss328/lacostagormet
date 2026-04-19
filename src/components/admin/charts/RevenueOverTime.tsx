'use client';

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { WidgetFrame } from '@/components/admin/charts/WidgetFrame';
import type { RevenuePoint } from '@/lib/admin/analytics';

type Grain = 'day' | 'week' | 'month';

function bucket(data: RevenuePoint[], grain: Grain): RevenuePoint[] {
  if (grain === 'day') return data;
  const map = new Map<string, { revenue: number; orders: number }>();
  for (const p of data) {
    const key =
      grain === 'month'
        ? p.date.slice(0, 7)
        : weekStart(p.date);
    const prev = map.get(key) ?? { revenue: 0, orders: 0 };
    prev.revenue += p.revenue;
    prev.orders += p.orders;
    map.set(key, prev);
  }
  return Array.from(map.entries()).map(([date, v]) => ({
    date,
    revenue: Math.round(v.revenue * 100) / 100,
    orders: v.orders,
  }));
}

function weekStart(iso: string): string {
  const d = new Date(iso);
  const day = d.getUTCDay();
  const diff = (day + 6) % 7; // Monday-start
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

function fmtMoney(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

export function RevenueOverTime({ series }: { series: RevenuePoint[] }) {
  const [grain, setGrain] = useState<Grain>('day');
  const grouped = useMemo(() => bucket(series, grain), [series, grain]);
  const totalRevenue = useMemo(
    () => grouped.reduce((s, p) => s + p.revenue, 0),
    [grouped],
  );
  const prevTotal = useMemo(
    () => {
      const half = Math.floor(grouped.length / 2);
      if (half < 2) return 0;
      return grouped.slice(0, half).reduce((s, p) => s + p.revenue, 0);
    },
    [grouped],
  );
  const recentTotal = useMemo(() => {
    const half = Math.floor(grouped.length / 2);
    return grouped.slice(half).reduce((s, p) => s + p.revenue, 0);
  }, [grouped]);
  const deltaPct =
    prevTotal === 0 ? 0 : Math.round(((recentTotal - prevTotal) / prevTotal) * 100);

  return (
    <WidgetFrame
      numeral="I"
      eyebrow="Revenue"
      title={
        <>
          The <em className="type-accent">ledger</em> over time.
        </>
      }
      cornerValue={`$${Math.round(totalRevenue).toLocaleString()}`}
      cornerDelta={deltaPct}
      cornerHint="vs. first half"
      action={
        <div className="flex items-center gap-4">
          {(['day', 'week', 'month'] as Grain[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGrain(g)}
              className="type-label-sm transition-colors duration-200"
              style={{
                color: grain === g ? 'var(--color-brand-deep)' : 'var(--color-ink-muted)',
                textDecoration: grain === g ? 'underline' : 'none',
                textUnderlineOffset: 4,
              }}
            >
              {g === 'day' ? 'Daily' : g === 'week' ? 'Weekly' : 'Monthly'}
            </button>
          ))}
        </div>
      }
    >
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={grouped} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="rgba(26, 17, 10, 0.06)" strokeDasharray="3 6" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: 'var(--color-ink-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--rule)' }}
              minTickGap={40}
              tickFormatter={(v: string) =>
                grain === 'month'
                  ? v.slice(5)
                  : v.slice(5)
              }
            />
            <YAxis
              tick={{ fill: 'var(--color-ink-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={fmtMoney}
              width={56}
            />
            <Tooltip
              cursor={{ stroke: 'var(--color-brand-deep)', strokeDasharray: '2 4' }}
              contentStyle={{
                background: 'var(--color-cream)',
                border: '1px solid var(--rule-strong)',
                borderRadius: 0,
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
              }}
              labelStyle={{ color: 'var(--color-ink)' }}
              formatter={(v, name) => {
                const n = typeof v === 'number' ? v : Number(v);
                return name === 'revenue' ? `$${n.toFixed(2)}` : n;
              }}
            />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="var(--color-brand-deep)"
              strokeWidth={1.8}
              dot={false}
              activeDot={{ r: 4, fill: 'var(--color-brand-deep)' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </WidgetFrame>
  );
}
