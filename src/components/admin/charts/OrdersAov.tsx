'use client';

import { useMemo, useState } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { WidgetFrame } from '@/components/admin/charts/WidgetFrame';
import type { RevenuePoint } from '@/lib/admin/analytics';

type Grain = 'day' | 'week';

function bucket(data: RevenuePoint[], grain: Grain): Array<{ date: string; orders: number; aov: number }> {
  if (grain === 'day') {
    return data.map((d) => ({
      date: d.date,
      orders: d.orders,
      aov: d.orders > 0 ? Math.round((d.revenue / d.orders) * 100) / 100 : 0,
    }));
  }
  const map = new Map<string, { revenue: number; orders: number }>();
  for (const p of data) {
    const key = weekStart(p.date);
    const prev = map.get(key) ?? { revenue: 0, orders: 0 };
    prev.revenue += p.revenue;
    prev.orders += p.orders;
    map.set(key, prev);
  }
  return Array.from(map.entries()).map(([date, v]) => ({
    date,
    orders: v.orders,
    aov: v.orders > 0 ? Math.round((v.revenue / v.orders) * 100) / 100 : 0,
  }));
}

function weekStart(iso: string): string {
  const d = new Date(iso);
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

export function OrdersAov({ series }: { series: RevenuePoint[] }) {
  const [grain, setGrain] = useState<Grain>('day');
  const grouped = useMemo(() => bucket(series, grain), [series, grain]);
  const totalOrders = useMemo(() => grouped.reduce((s, p) => s + p.orders, 0), [grouped]);
  const avgAov = useMemo(() => {
    const nonzero = grouped.filter((g) => g.orders > 0);
    if (nonzero.length === 0) return 0;
    return Math.round((nonzero.reduce((s, g) => s + g.aov, 0) / nonzero.length) * 100) / 100;
  }, [grouped]);

  return (
    <WidgetFrame
      numeral="IV"
      eyebrow="Volume + AOV"
      title={
        <>
          Orders vs <em className="type-accent">basket size</em>.
        </>
      }
      cornerValue={`${totalOrders.toLocaleString()} orders`}
      cornerHint={`avg AOV $${avgAov.toFixed(2)}`}
      action={
        <div className="flex items-center gap-4">
          {(['day', 'week'] as Grain[]).map((g) => (
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
              {g === 'day' ? 'Daily' : 'Weekly'}
            </button>
          ))}
        </div>
      }
    >
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={grouped} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="rgba(26, 17, 10, 0.06)" strokeDasharray="3 6" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: 'var(--color-ink-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--rule)' }}
              minTickGap={40}
              tickFormatter={(v: string) => v.slice(5)}
            />
            <YAxis
              yAxisId="left"
              tick={{ fill: 'var(--color-ink-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: 'var(--color-ink-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
              tickLine={false}
              axisLine={false}
              width={50}
              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--color-cream)',
                border: '1px solid var(--rule-strong)',
                borderRadius: 0,
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
              }}
              formatter={(value, name) => {
                const n = typeof value === 'number' ? value : Number(value);
                return name === 'aov' ? `$${n.toFixed(2)}` : n;
              }}
            />
            <Bar yAxisId="left" dataKey="orders" fill="var(--color-gold)" opacity={0.7} />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="aov"
              stroke="var(--color-brand-deep)"
              strokeWidth={1.8}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </WidgetFrame>
  );
}
