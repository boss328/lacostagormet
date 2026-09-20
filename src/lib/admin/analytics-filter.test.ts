import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDateRange } from './analytics-filter';
import { parseRange, resolveRange } from './range';

test('dashboard date ranges include their start and exclude their end for both query shapes', () => {
  const range = resolveRange('7d');
  const fixtures = [
    { created_at: new Date(Date.parse(range.since!) - 1).toISOString() },
    { created_at: range.since! },
    { created_at: new Date(Date.parse(range.until) - 1).toISOString() },
    { created_at: range.until },
  ];
  for (const column of ['created_at', 'orders.created_at']) {
    const query = {
      rows: [...fixtures],
      gte(key: string, value: string) {
        assert.equal(key, column);
        this.rows = this.rows.filter((row) => row.created_at >= value);
        return this;
      },
      lt(key: string, value: string) {
        assert.equal(key, column);
        this.rows = this.rows.filter((row) => row.created_at < value);
        return this;
      },
    };
    assert.deepEqual(
      applyDateRange(query, range, column).rows,
      fixtures.slice(1, 3),
    );
  }
  assert.equal(parseRange('invalid'), 'all');
  assert.equal(resolveRange('all').since, null);
});
