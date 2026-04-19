/**
 * safeJson — normalises an arbitrary value into a JSONB-safe shape suitable
 * for writing to Supabase/PostgREST without surprises.
 *
 * Why this exists: Phase 4 silently failed when `persistPayment` tried to
 * write the `authorizenet` SDK's response object as `raw_response`. The
 * SDK's output contains XML-parser internals, Buffer instances, and is not
 * cleanly JSON-serialisable via Supabase-js → PostgREST. The original
 * `safeJson` at the checkout route only did a `JSON.stringify` round-trip
 * check, then passed the original object through — Supabase sent it anyway
 * and PostgREST rejected it. The failure fell into `persistPayment`'s
 * silent catch, the order was left with status=pending + zero payments
 * rows, and the client saw success.
 *
 * Fix semantics:
 *   - Redact any field whose key matches a sensitive term (token, key,
 *     secret, password, auth, card, cvv, pan, accountnumber, cardnumber,
 *     routingnumber, ssn, dob, datadescriptor, datavalue, opaquedata,
 *     transactionkey, apiloginid — all case-insensitive substring match).
 *   - Normalise Error objects to { name, message, stack, cause }.
 *   - Truncate strings > 500 chars.
 *   - Max depth 8; deeper values become "[MAX_DEPTH]".
 *   - Never throws — on unexpected failure returns
 *     { _safeJsonFailed: true, reason }.
 */

const REDACT_PATTERNS = [
  'token',
  'key',
  'secret',
  'password',
  'auth',
  'card',
  'cvv',
  'ccv',
  'pan',
  'accountnumber',
  'cardnumber',
  'routingnumber',
  'ssn',
  'dob',
  'datadescriptor',
  'datavalue',
  'opaquedata',
  'transactionkey',
  'apiloginid',
];

const MAX_DEPTH = 8;
const STRING_HEAD = 300;
const STRING_THRESHOLD = 500;
const REDACTED = '[REDACTED]';

function shouldRedactKey(key: string): boolean {
  const lower = key.toLowerCase();
  return REDACT_PATTERNS.some((p) => lower.includes(p));
}

function normaliseString(s: string): string {
  if (s.length <= STRING_THRESHOLD) return s;
  return `${s.slice(0, STRING_HEAD)}...[TRUNCATED, ${s.length} total]`;
}

function normaliseError(e: Error): Record<string, unknown> {
  const out: Record<string, unknown> = {
    _error: true,
    name: e.name,
    message: normaliseString(String(e.message ?? '')),
  };
  if (typeof e.stack === 'string') out.stack = normaliseString(e.stack);
  // `cause` is ES2022 on the Error interface and present in our lib.
  const cause = (e as Error & { cause?: unknown }).cause;
  if (cause !== undefined) out.cause = safeJson(cause, 0);
  return out;
}

function walk(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;

  const t = typeof value;
  if (t === 'string') return normaliseString(value as string);
  if (t === 'number') {
    const n = value as number;
    return Number.isFinite(n) ? n : null;
  }
  if (t === 'boolean') return value;
  if (t === 'bigint') return (value as bigint).toString();
  if (t === 'function' || t === 'symbol') return `[${t}]`;

  if (depth >= MAX_DEPTH) return '[MAX_DEPTH]';

  if (value instanceof Error) return normaliseError(value);
  if (value instanceof Date) return value.toISOString();

  // Node Buffer / typed arrays — don't serialise bytes, just note them.
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return { _buffer: true, length: (value as Buffer).length };
  }
  if (value instanceof ArrayBuffer) {
    return { _arrayBuffer: true, byteLength: value.byteLength };
  }
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return { _typedArray: view.constructor?.name ?? 'TypedArray', byteLength: view.byteLength };
  }

  const obj = value as object;
  if (seen.has(obj)) return '[CIRCULAR]';
  seen.add(obj);

  if (Array.isArray(value)) {
    return (value as unknown[]).map((v) => walk(v, depth + 1, seen));
  }

  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (shouldRedactKey(key)) {
      out[key] = REDACTED;
      continue;
    }
    try {
      const child = (obj as Record<string, unknown>)[key];
      out[key] = walk(child, depth + 1, seen);
    } catch (err) {
      out[key] = { _getterFailed: true, name: (err as Error)?.name };
    }
  }
  return out;
}

export function safeJson(value: unknown, depth: number = 0): unknown {
  try {
    return walk(value, depth, new WeakSet());
  } catch (err) {
    return {
      _safeJsonFailed: true,
      reason: (err as Error)?.message ?? 'unknown',
    };
  }
}
