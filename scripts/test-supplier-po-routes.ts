import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { NextRequest } from 'next/server';

const require = createRequire(import.meta.url);
const origin = 'https://store.test';
type Action = 'send' | 'save' | 'cancel' | 'mark-acknowledged';
type Failure = 'lookup' | 'claim' | 'finalize' | 'save' | 'cancel' | null;
type Route = { POST: (request: NextRequest, context: { params: { id: string } }) => Promise<Response> };
type QueryBuilder = {
  select: () => QueryBuilder;
  update: (value: Record<string, unknown>) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  is: (column: string, value: unknown) => QueryBuilder;
  maybeSingle: () => QueryBuilder;
  then: (resolve: (value: unknown) => void) => void;
};

function compile<T = Route>(file: string, modules: Record<string, unknown>): T {
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const evaluated = { exports: {} as T };
  new Function('require', 'module', 'exports', source)((name: string) => {
    if (!(name in modules)) throw new Error(`Unmocked boundary: ${name}`);
    return modules[name];
  }, evaluated, evaluated.exports);
  return evaluated.exports;
}

// Real route and access-guard code; every database/email boundary is local.
function harness() {
  const poId = '44444444-4444-4444-8444-444444444444';
  const events: string[] = [];
  const emails: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];
  const state = {
    po: {
      id: poId, status: 'pending', email_send_started_at: null as string | null,
      email_subject: 'Old subject', email_body: 'Old body', warehouse_id: null as string | null,
      order_id: '11111111-1111-4111-8111-111111111111',
      vendor: { contact_email: 'supplier@example.test' as string | null },
    },
    preview: false,
    clientCalls: 0,
    failure: null as Failure,
    zeroFinalize: false,
    beforeClaim: null as null | (() => void),
    providerMode: 'success' as 'success' | 'error' | 'throw' | 'empty',
    providerWait: null as null | Promise<void>,
    providerReached: null as null | (() => void),
  };
  const guard = compile('../src/lib/admin/shipping-access.ts', {
    'server-only': {}, 'next/server': require('next/server'),
    './session': { ADMIN_COOKIE: 'test-admin', expectedSessionToken: async () => 'valid-token' },
    '@/lib/preview-mode': { isReadOnlyPreview: () => state.preview },
  });
  const modules = {
    'server-only': {}, 'next/server': require('next/server'),
    '@/lib/admin/shipping-access': guard,
    '@/lib/supabase/admin': {
      createAdminClient() {
        state.clientCalls++;
        return {
          from(table: string) {
            if (table === 'payment_audit_log') return { insert: async (value: Record<string, unknown>) => { audits.push(value); return { error: null }; } };
            assert.equal(table, 'vendor_orders');
            const filters = new Map<string, unknown>();
            let update: Record<string, unknown> | undefined;
            const builder: QueryBuilder = {
              select() { return builder; },
              update(value: Record<string, unknown>) { update = value; return builder; },
              eq(column: string, value: unknown) { filters.set(column, value); return builder; },
              is(column: string, value: unknown) { filters.set(column, value); return builder; },
              maybeSingle() { return builder; },
              then(resolve: (value: unknown) => void) {
                const kind = !update ? 'lookup' : update.email_send_started_at ? 'claim' : update.status === 'sent' ? 'finalize' : update.status === 'cancelled' ? 'cancel' : 'save';
                events.push(kind);
                if (kind === 'claim') state.beforeClaim?.();
                if (state.failure === kind) return resolve({ data: null, error: { code: '42703', message: 'Synthetic missing column or storage failure' } });
                const matches = [...filters].every(([key, value]) => (state.po as Record<string, unknown>)[key] === value);
                if (!matches || (kind === 'finalize' && state.zeroFinalize)) return resolve({ data: null, error: null });
                if (update) Object.assign(state.po, update);
                resolve({ data: { ...state.po, vendor: { ...state.po.vendor } }, error: null });
              },
            };
            return builder;
          },
        };
      },
    },
    '@/lib/resend/client': {
      VENDOR_EMAIL_FROM: 'store@example.test', VENDOR_EMAIL_REPLY_TO: 'support@example.test',
      getResend: () => ({ emails: { send: async (input: Record<string, unknown>) => {
        assert.ok(state.po.email_send_started_at, 'email must follow a persisted claim');
        emails.push(input); events.push('email'); state.providerReached?.();
        if (state.providerWait) await state.providerWait;
        if (state.providerMode === 'throw') throw new Error('Synthetic timeout');
        if (state.providerMode === 'error') return { data: null, error: { message: 'Synthetic provider rejection' } };
        return { data: state.providerMode === 'empty' ? null : { id: 'synthetic-message' }, error: null };
      } } }),
    },
  };
  const routes = Object.fromEntries((['send', 'save', 'cancel', 'mark-acknowledged'] as Action[]).map(action => [action, compile(`../src/app/api/admin/purchase-orders/[id]/${action}/route.ts`, modules)]));
  function request(action: Action, options: { auth?: boolean; origin?: string | null; subject?: string; body?: string } = {}) {
    const headers: Record<string, string> = {};
    if (options.auth !== false) headers.cookie = 'test-admin=valid-token';
    if (options.origin !== null) headers.origin = options.origin ?? origin;
    const body = new FormData(); body.set('subject', options.subject ?? 'Frozen subject'); body.set('body', options.body ?? 'Frozen body'); body.set('warehouse_id', 'warehouse-fixture');
    return routes[action].POST(new NextRequest(`${origin}/api/admin/purchase-orders/${poId}/${action}/`, { method: 'POST', headers, body }), { params: { id: poId } });
  }
  return { state, events, emails, audits, request };
}

test('supplier send persists a frozen claim before emailing, then checks finalization', async () => {
  const h = harness();
  assert.equal((await h.request('send')).status, 200);
  assert.deepEqual(h.events, ['lookup', 'claim', 'email', 'finalize']);
  assert.equal(h.state.po.status, 'sent');
  assert.ok(h.state.po.email_send_started_at);
  assert.equal(h.emails[0].subject, h.state.po.email_subject);
  assert.equal(h.emails[0].text, h.state.po.email_body);
  assert.equal((await h.request('send')).status, 409);
  assert.equal((await h.request('save')).status, 409);
  assert.equal((await h.request('cancel')).status, 409);
  assert.equal(h.emails.length, 1);
  assert.equal((await h.request('mark-acknowledged')).status, 200);
  assert.equal(h.state.po.status, 'confirmed', 'successful claims do not block ordinary supplier lifecycle');
});

test('a send in progress blocks another send, cancellation, and payload edits', async () => {
  const h = harness();
  let release!: () => void;
  h.state.providerWait = new Promise(resolve => { release = resolve; });
  const reached = new Promise<void>(resolve => { h.state.providerReached = resolve; });
  const first = h.request('send');
  await reached;
  const frozen = { ...h.state.po };
  for (const action of ['send', 'cancel', 'save'] as const) {
    assert.equal((await h.request(action, { subject: 'Changed', body: 'Changed' })).status, 409);
  }
  assert.deepEqual(h.state.po, frozen);
  assert.equal(h.emails.length, 1);
  release();
  assert.equal((await first).status, 200);
});

test('cancellation or another claim winning before the claim write prevents email', async () => {
  for (const winner of ['cancel', 'send']) {
    const h = harness();
    h.state.beforeClaim = () => {
      if (winner === 'cancel') h.state.po.status = 'cancelled';
      else h.state.po.email_send_started_at = '2026-10-15T12:00:00Z';
    };
    assert.equal((await h.request('send')).status, 409);
    assert.equal(h.emails.length, 0);
  }
});

test('lookup or claim persistence failures stop before email, including missing vendor columns', async () => {
  for (const failure of ['lookup', 'claim'] as const) {
    const h = harness(); h.state.failure = failure;
    assert.equal((await h.request('send')).status, 500);
    assert.equal(h.emails.length, 0);
    assert.equal(h.state.po.email_send_started_at, null);
  }
});

test('provider and finalization failures leave the attempt locked for reconciliation', async () => {
  for (const failure of ['error', 'throw', 'empty', 'finalize', 'zero-finalize'] as const) {
    const h = harness();
    if (failure === 'finalize') h.state.failure = 'finalize';
    else if (failure === 'zero-finalize') h.state.zeroFinalize = true;
    else h.state.providerMode = failure;
    const response = await h.request('send');
    assert.equal(response.status, 502);
    assert.match(await response.text(), /verification/);
    assert.equal(h.state.po.status, 'pending');
    assert.ok(h.state.po.email_send_started_at);
    assert.equal(h.emails.length, 1);
    h.state.failure = null;
    for (const action of ['send', 'save', 'cancel'] as const) assert.equal((await h.request(action)).status, 409);
    assert.equal(h.emails.length, 1);
  }
});

test('save is conditional on both pending status and an unclaimed send', async () => {
  const h = harness();
  assert.equal((await h.request('save')).status, 200);
  assert.equal(h.state.po.email_subject, 'Frozen subject');
  for (const status of ['sent', 'confirmed', 'shipped', 'delivered', 'cancelled']) {
    h.state.po.status = status;
    assert.equal((await h.request('save', { subject: 'Changed' })).status, 409);
    assert.equal(h.state.po.email_subject, 'Frozen subject');
  }
  h.state.po.status = 'pending'; h.state.po.email_send_started_at = '2026-10-15T12:00:00Z';
  assert.equal((await h.request('save', { subject: 'Changed' })).status, 409);
  assert.equal(h.state.po.email_subject, 'Frozen subject');
});

test('supplier send and save preserve authorization, origin, and preview guards', async () => {
  for (const action of ['send', 'save'] as const) {
    for (const scenario of ['anonymous', 'cross-origin', 'missing-origin', 'preview']) {
      const h = harness(); h.state.preview = scenario === 'preview';
      const response = await h.request(action, { auth: scenario !== 'anonymous', origin: scenario === 'cross-origin' ? 'https://other.test' : scenario === 'missing-origin' ? null : origin });
      assert.equal(response.status, scenario === 'anonymous' ? 401 : scenario === 'preview' ? 409 : 403);
      assert.equal(h.state.clientCalls, 0); assert.equal(h.emails.length, 0);
    }
  }
});
