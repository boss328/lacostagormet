import type { ReactNode } from 'react';

/**
 * Standard frame for dashboard widgets. Paper-2 band inset with a cream
 * interior, mono eyebrow with roman numeral, Fraunces title with italic
 * accent, optional corner metric + delta, and a body slot.
 *
 * Keep every widget at the same visual grammar — the dashboard reads as a
 * single editorial page rather than a Mondrian of competing cards.
 */
export function WidgetFrame({
  numeral,
  eyebrow,
  title,
  cornerValue,
  cornerDelta,
  cornerHint,
  action,
  children,
  minHeight = 280,
}: {
  numeral: string;
  eyebrow: string;
  title: ReactNode;
  cornerValue?: string;
  cornerDelta?: number | null;
  cornerHint?: string;
  action?: ReactNode;
  children: ReactNode;
  minHeight?: number;
}) {
  return (
    <section
      className="bg-cream"
      style={{
        border: '1px solid var(--rule-strong)',
        padding: '24px 26px 20px',
        minHeight,
      }}
    >
      <header
        className="flex items-baseline justify-between gap-5 pb-3 mb-4 flex-wrap"
        style={{ borderBottom: '1px dashed var(--rule)' }}
      >
        <div className="flex items-baseline gap-3 min-w-0">
          <span
            className="font-display italic text-brand-deep shrink-0"
            style={{
              fontSize: '18px',
              lineHeight: 1,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              width: 20,
            }}
          >
            {numeral}
          </span>
          <span className="type-label text-ink-muted">§ {eyebrow}</span>
        </div>

        {cornerValue && (
          <div className="flex items-baseline gap-3">
            <span
              className="font-display italic text-brand-deep"
              style={{
                fontSize: '20px',
                lineHeight: 1,
                fontWeight: 500,
                letterSpacing: '-0.015em',
              }}
            >
              {cornerValue}
            </span>
            {typeof cornerDelta === 'number' && (
              <span
                className="type-data-mono"
                style={{
                  color:
                    cornerDelta > 0
                      ? 'var(--color-forest)'
                      : cornerDelta < 0
                        ? 'var(--color-accent)'
                        : 'var(--color-ink-muted)',
                }}
              >
                {cornerDelta > 0 ? '+' : ''}
                {cornerDelta}%
              </span>
            )}
            {cornerHint && (
              <span className="type-data-mono text-ink-muted">{cornerHint}</span>
            )}
          </div>
        )}
      </header>

      <div className="mb-4">
        <h2
          className="font-display text-ink"
          style={{
            fontSize: '22px',
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            fontWeight: 400,
          }}
        >
          {title}
        </h2>
      </div>

      <div>{children}</div>

      {action && (
        <div
          className="mt-4 pt-3"
          style={{ borderTop: '1px dashed var(--rule)' }}
        >
          {action}
        </div>
      )}
    </section>
  );
}
