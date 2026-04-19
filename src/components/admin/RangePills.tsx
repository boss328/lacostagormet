'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTransition } from 'react';
import { RANGE_KEYS, type RangeKey } from '@/lib/admin/range';

const LABELS: Record<RangeKey, string> = {
  all: 'All-time',
  year: 'Year',
  '90d': '90 days',
  '30d': '30 days',
  '7d': '7 days',
};

/**
 * Time-range filter pills. Mutates the URL `?range=` param and triggers a
 * server-component re-render via router.replace + transition. Default
 * (`all`) drops the param entirely so the URL stays clean.
 */
export function RangePills({ active }: { active: RangeKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, start] = useTransition();

  function pick(next: RangeKey) {
    const qs = new URLSearchParams(search?.toString() ?? '');
    if (next === 'all') qs.delete('range');
    else qs.set('range', next);
    const s = qs.toString();
    start(() => router.replace(s ? `${pathname}?${s}` : pathname));
  }

  return (
    <div
      className="inline-flex items-center"
      style={{
        border: '1px solid var(--rule-strong)',
        background: 'var(--color-cream)',
        opacity: pending ? 0.65 : 1,
        transition: 'opacity 0.15s',
      }}
      role="group"
      aria-label="Time range"
    >
      {RANGE_KEYS.map((k, i) => {
        const isActive = k === active;
        return (
          <button
            key={k}
            type="button"
            onClick={() => pick(k)}
            className="type-label-sm transition-colors duration-150"
            style={{
              padding: '6px 13px',
              borderLeft: i === 0 ? 'none' : '1px solid var(--rule)',
              background: isActive ? 'var(--color-ink)' : 'transparent',
              color: isActive ? 'var(--color-cream)' : 'var(--color-ink-2)',
              minHeight: 30,
              cursor: 'pointer',
            }}
          >
            {LABELS[k]}
          </button>
        );
      })}
    </div>
  );
}
