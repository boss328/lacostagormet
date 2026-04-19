'use client';

import { useState } from 'react';
import { RangePills } from '@/components/admin/RangePills';
import type { RangeKey } from '@/lib/admin/range';

/**
 * Collapsible analytics frame used by inner admin section pages.
 *
 * Renders the range pills + headline metric row inline. The chart grid
 * (passed as children) is hidden until the user clicks the toggle —
 * keeps the table visible above the fold.
 *
 * Why client + a server-fetched children: section pages decide what to
 * render; this component only handles the disclosure. State is local —
 * persistence across navigation isn't worth the complexity.
 */
export function SectionAnalytics({
  range,
  eyebrow,
  headline,
  charts,
  defaultOpen = false,
}: {
  range: RangeKey;
  eyebrow: string;
  /** The 3-4 headline stats shown when collapsed. */
  headline: React.ReactNode;
  /** The chart grid shown when expanded. */
  charts: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      className="mb-8"
      style={{ border: '1px solid var(--rule)', background: 'var(--color-cream)' }}
    >
      <header
        className="flex items-baseline justify-between gap-6 px-5 py-4 flex-wrap"
        style={{ borderBottom: open ? '1px solid var(--rule)' : 'none' }}
      >
        <div className="flex items-center gap-4 flex-wrap">
          <p className="type-label text-ink-muted">§ {eyebrow}</p>
          <RangePills active={range} />
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="type-label-sm text-ink hover:text-brand-deep transition-colors duration-150"
          aria-expanded={open}
        >
          {open ? 'Hide charts ↑' : 'Show charts ↓'}
        </button>
      </header>

      <div className="px-5 py-4">{headline}</div>

      {open && <div className="px-5 pb-5">{charts}</div>}
    </section>
  );
}

/** Small headline metric tile used inside SectionAnalytics. */
export function HeadlineStat({
  label,
  value,
  sub,
  delta,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: { label: string; sign: 'pos' | 'neg' | 'zero' } | null;
}) {
  const deltaColor =
    delta?.sign === 'pos'
      ? 'var(--color-forest)'
      : delta?.sign === 'neg'
        ? 'var(--color-accent)'
        : 'var(--color-ink-muted)';
  return (
    <div className="min-w-0">
      <p className="type-label-sm text-ink-muted mb-2">{label}</p>
      <p
        className="font-display italic text-brand-deep"
        style={{ fontSize: '24px', lineHeight: 1, fontWeight: 500, letterSpacing: '-0.018em' }}
      >
        {value}
      </p>
      <div className="flex items-baseline gap-2 mt-2">
        {delta && (
          <span className="type-data-mono" style={{ color: deltaColor }}>
            {delta.label}
          </span>
        )}
        {sub && <span className="type-data-mono text-ink-muted">{sub}</span>}
      </div>
    </div>
  );
}
