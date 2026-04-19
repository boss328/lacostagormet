'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { WidgetFrame } from '@/components/admin/charts/WidgetFrame';
import type { TopProduct } from '@/lib/admin/analytics';

type Metric = 'revenue' | 'units';

export function TopProducts({ products }: { products: TopProduct[] }) {
  const [metric, setMetric] = useState<Metric>('revenue');
  const sorted = useMemo(
    () =>
      [...products].sort(
        (a, b) =>
          (metric === 'revenue' ? b.revenue : b.units) -
          (metric === 'revenue' ? a.revenue : a.units),
      ),
    [products, metric],
  );
  const max =
    sorted.length > 0
      ? metric === 'revenue'
        ? sorted[0].revenue
        : sorted[0].units
      : 1;

  const totalUnits = useMemo(() => products.reduce((s, p) => s + p.units, 0), [products]);
  const totalRevenue = useMemo(
    () => products.reduce((s, p) => s + p.revenue, 0),
    [products],
  );

  return (
    <WidgetFrame
      numeral="II"
      eyebrow="Top performers"
      title={
        <>
          The <em className="type-accent">shelf leaders</em>.
        </>
      }
      cornerValue={
        metric === 'revenue'
          ? `$${Math.round(totalRevenue).toLocaleString()}`
          : `${totalUnits.toLocaleString()} units`
      }
      cornerHint="all time paid"
      action={
        <div className="flex items-center gap-4">
          {(['revenue', 'units'] as Metric[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              className="type-label-sm transition-colors duration-200"
              style={{
                color: metric === m ? 'var(--color-brand-deep)' : 'var(--color-ink-muted)',
                textDecoration: metric === m ? 'underline' : 'none',
                textUnderlineOffset: 4,
              }}
            >
              By {m}
            </button>
          ))}
        </div>
      }
    >
      <div className="flex flex-col">
        {sorted.slice(0, 10).map((p, i) => {
          const value = metric === 'revenue' ? p.revenue : p.units;
          const pct = max > 0 ? (value / max) * 100 : 0;
          return (
            <div
              key={p.sku}
              className="py-2"
              style={{ borderBottom: '1px solid var(--rule)' }}
            >
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <div className="min-w-0 flex items-baseline gap-3">
                  <span className="type-data-mono text-ink-muted shrink-0">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span
                    className="font-display text-ink truncate"
                    style={{ fontSize: '13.5px' }}
                  >
                    {p.name}
                  </span>
                </div>
                <span className="type-data-mono text-brand-deep shrink-0">
                  {metric === 'revenue'
                    ? `$${Math.round(p.revenue).toLocaleString()}`
                    : `${p.units.toLocaleString()}`}
                </span>
              </div>
              <div
                className="relative"
                style={{ height: 3, background: 'var(--rule)' }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: 'var(--color-brand-deep)',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {sorted.length > 10 && (
        <p className="type-data-mono text-ink-muted mt-3 text-right">
          + {sorted.length - 10} more — <Link href="/admin/products/" className="hover:text-brand-deep">view all</Link>
        </p>
      )}
    </WidgetFrame>
  );
}
