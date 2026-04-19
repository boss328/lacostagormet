/**
 * Unit tests for safeJson. Run directly:
 *   pnpm tsx src/lib/authnet/safe-json.test.ts
 *
 * Uses Node's built-in assert — no test-runner dependency. Each test logs
 * "OK <name>" on pass; exits non-zero on failure.
 */

import assert from 'node:assert/strict';
import { safeJson } from './safe-json';

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

// Fixture 1 — an Auth.net-style response object with sensitive fields,
// XML-parser internals, and Buffer. The classic shape that broke Phase 4.
test('fixture 1: auth.net response with sensitive fields and Buffer', () => {
  const input = {
    messages: {
      resultCode: 'Ok',
      message: [{ code: 'I00001', text: 'Successful.' }],
    },
    transactionResponse: {
      responseCode: '1',
      authCode: 'ABC123',
      transId: '123456789',
      accountNumber: 'XXXX1111',
      accountType: 'Visa',
      // Sensitive — must be redacted.
      dataDescriptor: 'COMMON.ACCEPT.INAPP.PAYMENT',
      dataValue: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.very-long-opaque-token',
      cardNumber: '4111111111111111',
      cvv: '123',
    },
    apiLoginID: 'publicKey-leaks-anyway',
    transactionKey: 'super-secret',
    // Buffer — should become a marker object.
    _rawXml: Buffer.from('<xml>stuff</xml>'),
  };

  const out = safeJson(input) as Record<string, unknown>;
  const tx = out.transactionResponse as Record<string, unknown>;

  // Non-sensitive fields preserved.
  assert.equal(tx.responseCode, '1');
  assert.equal(tx.transId, '123456789');
  assert.equal(tx.accountType, 'Visa');

  // Sensitive fields redacted. Spec uses case-insensitive *substring* match,
  // so "authCode" matches "auth" and redacts too — this is intentional
  // over-redaction (safer than under-redacting for an audit log). Auth.net's
  // authCode is technically non-sensitive, but losing it from the log is a
  // reasonable cost for guaranteed credential hygiene.
  assert.equal(tx.authCode, '[REDACTED]');
  assert.equal(tx.accountNumber, '[REDACTED]');
  assert.equal(tx.dataDescriptor, '[REDACTED]');
  assert.equal(tx.dataValue, '[REDACTED]');
  assert.equal(tx.cardNumber, '[REDACTED]');
  assert.equal(tx.cvv, '[REDACTED]');
  assert.equal(out.apiLoginID, '[REDACTED]');
  assert.equal(out.transactionKey, '[REDACTED]');

  // Buffer normalised to marker.
  const buf = out._rawXml as { _buffer: true; length: number };
  assert.equal(buf._buffer, true);
  assert.equal(typeof buf.length, 'number');

  // Whole thing must round-trip through JSON without surprise.
  const json = JSON.stringify(out);
  assert.ok(!json.includes('4111111111111111'), 'raw PAN must not survive');
  assert.ok(!json.includes('super-secret'), 'raw transaction key must not survive');
  assert.ok(!json.includes('eyJhbGci'), 'raw opaque token must not survive');
});

// Fixture 2 — circular reference and deep nesting. Must not throw, must
// emit [CIRCULAR] and [MAX_DEPTH] markers.
test('fixture 2: circular refs + depth limit', () => {
  const a: Record<string, unknown> = { name: 'a' };
  const b: Record<string, unknown> = { name: 'b', back: a };
  a.forward = b; // a → b → a cycle

  const out = safeJson(a) as Record<string, unknown>;
  const forward = out.forward as Record<string, unknown>;
  assert.equal(forward.name, 'b');
  assert.equal(forward.back, '[CIRCULAR]');

  // Build a 20-deep structure, confirm it collapses at MAX_DEPTH.
  type Deep = { next?: Deep; tag: number };
  const root: Deep = { tag: 0 };
  let cur: Deep = root;
  for (let i = 1; i < 20; i++) {
    cur.next = { tag: i };
    cur = cur.next;
  }
  const deepOut = safeJson(root) as Record<string, unknown>;
  // Walk into the output and find the [MAX_DEPTH] marker.
  let node: unknown = deepOut;
  let reached = false;
  for (let i = 0; i < 12; i++) {
    if (typeof node !== 'object' || node === null) break;
    const n = (node as Record<string, unknown>).next;
    if (n === '[MAX_DEPTH]') {
      reached = true;
      break;
    }
    node = n;
  }
  assert.ok(reached, 'should hit [MAX_DEPTH] marker on 20-deep input');

  // Result must serialise.
  JSON.stringify(deepOut);
});

// Fixture 3 — Error normalisation, bigint, long string truncation, function,
// symbol, Date. All the weird types that break raw JSON.stringify or
// surprise Supabase's payload encoder.
test('fixture 3: Error + bigint + long string + function + Date', () => {
  const cause = new Error('root cause');
  const err = new Error('outer', { cause });

  const longStr = 'x'.repeat(1000);
  const input = {
    err,
    big: 9007199254740993n,
    fn: () => 42,
    when: new Date('2026-04-19T07:00:00.000Z'),
    longStr,
    ok: 'short',
  };

  const out = safeJson(input) as Record<string, unknown>;

  const normErr = out.err as Record<string, unknown>;
  assert.equal(normErr._error, true);
  assert.equal(normErr.name, 'Error');
  assert.equal(normErr.message, 'outer');
  assert.equal(typeof normErr.stack, 'string');
  const normCause = normErr.cause as Record<string, unknown>;
  assert.equal(normCause._error, true);
  assert.equal(normCause.message, 'root cause');

  assert.equal(out.big, '9007199254740993');
  assert.equal(out.fn, '[function]');
  assert.equal(out.when, '2026-04-19T07:00:00.000Z');
  assert.equal(out.ok, 'short');

  const truncated = out.longStr as string;
  assert.ok(truncated.length < 1000, 'long string must be truncated');
  assert.ok(truncated.includes('[TRUNCATED, 1000 total]'));
  assert.ok(truncated.startsWith('xxx'));

  // Result must serialise.
  JSON.stringify(out);
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll tests passed.');
}
