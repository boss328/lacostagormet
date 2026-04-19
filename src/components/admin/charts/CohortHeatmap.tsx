import { WidgetFrame } from '@/components/admin/charts/WidgetFrame';
import type { CohortRow } from '@/lib/admin/analytics';

/**
 * Retention heatmap. Rows = first-purchase month cohorts. Columns =
 * months since cohort start. Cells shade from cream (0%) to brand-deep
 * (100%). -1 sentinel means "future month" and renders as an empty
 * dashed cell.
 */
export function CohortHeatmap({ cohorts }: { cohorts: CohortRow[] }) {
  const totalCohortCustomers = cohorts.reduce((s, c) => s + c.size, 0);

  return (
    <WidgetFrame
      numeral="V"
      eyebrow="Cohort retention"
      title={
        <>
          Who <em className="type-accent">comes back</em>.
        </>
      }
      cornerValue={totalCohortCustomers.toLocaleString()}
      cornerHint="customers across 12 cohorts"
      minHeight={320}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ fontFamily: 'var(--font-mono)' }}>
          <thead>
            <tr>
              <th
                className="type-label-sm text-ink-muted text-left"
                style={{ padding: '4px 8px 8px 0', borderBottom: '1px solid var(--rule)' }}
              >
                Cohort
              </th>
              <th
                className="type-label-sm text-ink-muted text-right"
                style={{ padding: '4px 8px 8px', borderBottom: '1px solid var(--rule)' }}
              >
                Size
              </th>
              {Array.from({ length: 12 }, (_, i) => (
                <th
                  key={i}
                  className="type-label-sm text-ink-muted text-center"
                  style={{
                    padding: '4px 2px 8px',
                    borderBottom: '1px solid var(--rule)',
                    fontSize: '9px',
                  }}
                >
                  M{i}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c) => (
              <tr key={c.cohort}>
                <td
                  className="font-display text-ink"
                  style={{
                    padding: '5px 8px 5px 0',
                    fontSize: '12px',
                    letterSpacing: '-0.01em',
                    borderBottom: '1px solid var(--rule)',
                  }}
                >
                  {c.cohort}
                </td>
                <td
                  className="text-right text-ink-muted"
                  style={{
                    padding: '5px 8px',
                    fontSize: '11px',
                    borderBottom: '1px solid var(--rule)',
                  }}
                >
                  {c.size}
                </td>
                {c.retention.map((pct, i) => {
                  const future = pct < 0;
                  const bg = future
                    ? 'transparent'
                    : pct === 0
                      ? 'var(--color-cream)'
                      : shadeFor(pct);
                  return (
                    <td
                      key={i}
                      style={{
                        borderBottom: '1px solid var(--rule)',
                        padding: 0,
                      }}
                    >
                      <div
                        className="text-center"
                        title={future ? 'Future' : `${pct}% retention · month ${i}`}
                        style={{
                          background: bg,
                          color: pct >= 60 ? 'var(--color-cream)' : 'var(--color-ink)',
                          padding: '5px 2px',
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          border: future ? '1px dashed var(--rule)' : '1px solid var(--rule)',
                          minWidth: 28,
                        }}
                      >
                        {future ? '' : `${pct}%`}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="type-data-mono text-ink-muted mt-3">
        Reads top-to-bottom by cohort start; darker = stronger retention at that month.
      </p>
    </WidgetFrame>
  );
}

function shadeFor(pct: number): string {
  // 0..100 → cream→brand-deep. Use HSL interpolation for a warm gradient.
  // We hand-pick stops to keep it aligned with the palette tokens.
  if (pct >= 80) return 'var(--color-brand-deep)';
  if (pct >= 60) return 'var(--color-brand)';
  if (pct >= 40) return 'rgba(122, 59, 27, 0.55)';
  if (pct >= 20) return 'rgba(184, 138, 72, 0.55)';
  if (pct >= 5) return 'rgba(212, 169, 97, 0.35)';
  return 'var(--color-paper-2)';
}
