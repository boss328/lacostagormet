import { WidgetFrame } from '@/components/admin/charts/WidgetFrame';
import type { StateBreakdown } from '@/lib/admin/analytics';

/**
 * Geographic breakdown — not a full US SVG map (that requires a ~30kb
 * topojson and a projection lib). Instead, a ranked revenue-by-state bar
 * list with a compact 2-column layout. Useful for the same question
 * ("where do orders come from?") without the map overhead. Phase 7 can
 * swap in a proper choropleth if Jeff misses it.
 */
export function GeographicBreakdown({ states }: { states: StateBreakdown[] }) {
  const totalRevenue = states.reduce((s, v) => s + v.revenue, 0);
  const max = states[0]?.revenue ?? 1;
  const topTen = states.slice(0, 12);

  return (
    <WidgetFrame
      numeral="VII"
      eyebrow="Geography"
      title={
        <>
          Revenue by <em className="type-accent">state</em>.
        </>
      }
      cornerValue={`${states.length} states`}
      cornerHint={`$${Math.round(totalRevenue).toLocaleString()} total`}
      minHeight={320}
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
        {topTen.map((s) => {
          const pct = max > 0 ? (s.revenue / max) * 100 : 0;
          return (
            <div
              key={s.state}
              className="py-2"
              style={{ borderBottom: '1px solid var(--rule)' }}
            >
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="font-display text-ink" style={{ fontSize: '13.5px' }}>
                  {s.state}{' '}
                  <span className="type-data-mono text-ink-muted">
                    · {s.orders} orders
                  </span>
                </span>
                <span className="type-data-mono text-brand-deep">
                  ${Math.round(s.revenue).toLocaleString()}
                </span>
              </div>
              <div className="relative" style={{ height: 3, background: 'var(--rule)' }}>
                <div
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: 'var(--color-gold)',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {states.length > 12 && (
        <p className="type-data-mono text-ink-muted mt-3">
          + {states.length - 12} more states.
        </p>
      )}
    </WidgetFrame>
  );
}
