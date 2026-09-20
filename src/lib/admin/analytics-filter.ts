import type { Range } from './range';

/** Keep date boundaries identical for order and joined order-item charts. */
export function applyDateRange<
  T extends {
    gte(column: string, value: string): T;
    lt(column: string, value: string): T;
  },
>(query: T, range?: Range, column = 'created_at'): T {
  if (range?.since) query = query.gte(column, range.since);
  if (range?.until) query = query.lt(column, range.until);
  return query;
}
