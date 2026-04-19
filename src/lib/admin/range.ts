/**
 * Time-range framing for admin analytics.
 *
 * Single source of truth for: pill labels, URL param key, since/until window,
 * prior-period mirror window (for delta vs prior), and recommended chart
 * grain. Used by the dashboard, section analytics, and the RangePills
 * client component.
 *
 * URL convention: `?range=30d` — keys below.
 */

export type RangeKey = 'all' | 'year' | '90d' | '30d' | '7d';
export type Grain = 'day' | 'week' | 'month';

export type Range = {
  key: RangeKey;
  label: string;
  short: string;        // for in-line metric labels: "all-time" / "last 30 days"
  /** ISO timestamp window start (or null for all-time). */
  since: string | null;
  /** ISO timestamp window end. */
  until: string;
  /** Prior-period window — same length, immediately preceding. Null for all-time. */
  priorSince: string | null;
  priorUntil: string | null;
  /** Number of days in the window — used for sparkline buckets. Null for all-time. */
  days: number | null;
  /** Recommended chart aggregation. */
  grain: Grain;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const META: Record<
  RangeKey,
  { label: string; short: string; days: number | null; grain: Grain }
> = {
  all:  { label: 'All-time',  short: 'all-time',     days: null, grain: 'month' },
  year: { label: 'Year',      short: 'last year',    days: 365,  grain: 'week'  },
  '90d': { label: '90 days',  short: 'last 90 days', days: 90,   grain: 'week'  },
  '30d': { label: '30 days',  short: 'last 30 days', days: 30,   grain: 'day'   },
  '7d':  { label: '7 days',   short: 'last 7 days',  days: 7,    grain: 'day'   },
};

export const RANGE_KEYS: RangeKey[] = ['all', 'year', '90d', '30d', '7d'];

export function parseRange(raw: string | string[] | undefined): RangeKey {
  if (typeof raw !== 'string') return 'all';
  return (RANGE_KEYS as string[]).includes(raw) ? (raw as RangeKey) : 'all';
}

export function resolveRange(key: RangeKey): Range {
  const meta = META[key];
  const now = new Date();
  const until = now.toISOString();
  if (meta.days === null) {
    return {
      key,
      label: meta.label,
      short: meta.short,
      since: null,
      until,
      priorSince: null,
      priorUntil: null,
      days: null,
      grain: meta.grain,
    };
  }
  const since = new Date(now.getTime() - meta.days * DAY_MS).toISOString();
  const priorUntil = since;
  const priorSince = new Date(now.getTime() - 2 * meta.days * DAY_MS).toISOString();
  return {
    key,
    label: meta.label,
    short: meta.short,
    since,
    until,
    priorSince,
    priorUntil,
    days: meta.days,
    grain: meta.grain,
  };
}

/** Format a percent delta with sign + symbol. Returns null for missing. */
export function fmtDelta(curr: number, prior: number | null | undefined): {
  pct: number | null;
  label: string;
  sign: 'pos' | 'neg' | 'zero';
} {
  if (prior == null || prior === 0) {
    return { pct: null, label: '—', sign: 'zero' };
  }
  const pct = Math.round(((curr - prior) / prior) * 100);
  return {
    pct,
    label: `${pct > 0 ? '+' : ''}${pct}%`,
    sign: pct > 0 ? 'pos' : pct < 0 ? 'neg' : 'zero',
  };
}
