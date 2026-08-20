/**
 * Unit tests for pickTransactionForInvoice. Run directly:
 *   pnpm tsx src/lib/authnet/pick-transaction.test.ts
 *
 * Uses Node's built-in assert — no test-runner dependency. Each test logs
 * "OK <name>" on pass; exits non-zero on failure.
 */

import assert from 'node:assert/strict';
import { pickTransactionForInvoice, type UnsettledTransactionSummary } from './pick-transaction';

let failures = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${name}`);
  } catch (e) {
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(e);
  }
}

function tx(
  transId: string,
  invoiceNumber: string,
  transactionStatus: string,
  submitTimeUTC: string,
): UnsettledTransactionSummary {
  return { transId, invoiceNumber, transactionStatus, submitTimeUTC };
}

test('empty list returns null', () => {
  assert.equal(pickTransactionForInvoice([], 'LCG-10057'), null);
});

test('no invoice match returns null', () => {
  const list = [tx('1', 'LCG-10001', 'capturedPendingSettlement', '2026-08-20T01:50:00Z')];
  assert.equal(pickTransactionForInvoice(list, 'LCG-10057'), null);
});

test('single approved match is returned', () => {
  const list = [
    tx('1', 'LCG-10001', 'capturedPendingSettlement', '2026-08-20T01:00:00Z'),
    tx('2', 'LCG-10057', 'capturedPendingSettlement', '2026-08-20T01:50:00Z'),
  ];
  assert.equal(pickTransactionForInvoice(list, 'LCG-10057'), '2');
});

test('approved beats a newer decline (retry after decline)', () => {
  const list = [
    tx('newer-declined', 'LCG-10057', 'declined', '2026-08-20T01:55:00Z'),
    tx('older-approved', 'LCG-10057', 'capturedPendingSettlement', '2026-08-20T01:50:00Z'),
  ];
  assert.equal(pickTransactionForInvoice(list, 'LCG-10057'), 'older-approved');
});

test('two approved matches: newest wins', () => {
  const list = [
    tx('older', 'LCG-10057', 'capturedPendingSettlement', '2026-08-20T01:40:00Z'),
    tx('newer', 'LCG-10057', 'authorizedPendingCapture', '2026-08-20T01:50:00Z'),
  ];
  assert.equal(pickTransactionForInvoice(list, 'LCG-10057'), 'newer');
});

test('only declines: newest decline is returned so the order can cancel', () => {
  const list = [
    tx('older', 'LCG-10057', 'declined', '2026-08-20T01:40:00Z'),
    tx('newer', 'LCG-10057', 'declined', '2026-08-20T01:50:00Z'),
  ];
  assert.equal(pickTransactionForInvoice(list, 'LCG-10057'), 'newer');
});

test('fraud-held transactions count as approved-ish', () => {
  const list = [
    tx('declined', 'LCG-10057', 'declined', '2026-08-20T01:55:00Z'),
    tx('held', 'LCG-10057', 'FDSPendingReview', '2026-08-20T01:50:00Z'),
  ];
  assert.equal(pickTransactionForInvoice(list, 'LCG-10057'), 'held');
});

test('rows missing transId or fields are skipped, not crashed on', () => {
  const list: UnsettledTransactionSummary[] = [
    { invoiceNumber: 'LCG-10057', transactionStatus: 'capturedPendingSettlement' },
    { transId: 'ok', invoiceNumber: 'LCG-10057' },
  ];
  assert.equal(pickTransactionForInvoice(list, 'LCG-10057'), 'ok');
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll pick-transaction tests passed.');
