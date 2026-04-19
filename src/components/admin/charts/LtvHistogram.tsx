'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import { WidgetFrame } from '@/components/admin/charts/WidgetFrame';
import type { LtvBucket } from '@/lib/admin/analytics';

export function LtvHistogram({ buckets }: { buckets: LtvBucket[] }) {
  const totalCustomers = buckets.reduce((s, b) => s + b.count, 0);
  return (
    <WidgetFrame
      numeral="III"
      eyebrow="Customer LTV"
      title={
        <>
          What our <em className="type-accent">customers</em> spend.
        </>
      }
      cornerValue={totalCustomers.toLocaleString()}
      cornerHint="customers on file"
    >
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={buckets} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}>
            <CartesianGrid
              stroke="rgba(26, 17, 10, 0.06)"
              strokeDasharray="3 6"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{
                fill: 'var(--color-ink-muted)',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
              }}
              tickLine={false}
              axisLine={{ stroke: 'var(--rule)' }}
            />
            <YAxis
              tick={{
                fill: 'var(--color-ink-muted)',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
              }}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) =>
                v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
              }
            />
            <Tooltip
              cursor={{ fill: 'rgba(78, 36, 16, 0.05)' }}
              contentStyle={{
                background: 'var(--color-cream)',
                border: '1px solid var(--rule-strong)',
                borderRadius: 0,
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
              }}
            />
            <Bar dataKey="count" fill="var(--color-brand-deep)" radius={0}>
              <LabelList
                dataKey="count"
                position="top"
                fill="var(--color-ink-muted)"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </WidgetFrame>
  );
}
