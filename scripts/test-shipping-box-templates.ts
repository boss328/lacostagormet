import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { NextRequest } from 'next/server';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type Row = { id: string; name: string; length_in: number; width_in: number; height_in: number; updated_at: string };
type Result = { data: unknown; error: { code: string; message: string } | null };
const require = createRequire(import.meta.url);
const origin = 'https://box-fixture.test';
const templateId = '11111111-1111-4111-8111-111111111111';
const initialVersion = '2026-10-16T00:00:00.000001Z';
const input = { name: 'Coffee case', lengthIn: 12, widthIn: 9.5, heightIn: 6 };

function evaluate(file: string, modules: Record<string, unknown>): Record<string, unknown> {
  const compiled = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const target = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((name: string) => {
    if (!(name in modules)) throw new Error(`Unmocked box-template boundary: ${name}`);
    return modules[name];
  }, target, target.exports);
  return target.exports;
}

function harness() {
  const state = {
    rows: [] as Row[], preview: false, expectedToken: 'valid-token',
    clientCalls: 0, writes: 0, errorCode: '', sequence: 1,
    beforeExecute: null as (() => void) | null,
  };
  function seed() {
    const row: Row = { id: templateId, name: input.name, length_in: input.lengthIn, width_in: input.widthIn, height_in: input.heightIn, updated_at: initialVersion };
    state.rows.push(row);
    return { ...row };
  }
  const session = { ADMIN_COOKIE: 'fixture-admin', expectedSessionToken: async () => state.expectedToken };
  const preview = { isReadOnlyPreview: () => state.preview };
  const guard = evaluate('../src/lib/admin/shipping-access.ts', {
    'server-only': {}, 'next/server': require('next/server'), './session': session, '@/lib/preview-mode': preview,
  });
  const helpers = evaluate('../src/lib/shipping/box-templates.ts', {});
  const route = evaluate('../src/app/api/admin/shipping/box-templates/route.ts', {
    'server-only': {}, 'next/server': require('next/server'),
    '@/lib/admin/session': session, '@/lib/admin/shipping-access': guard,
    '@/lib/shipping/box-templates': helpers,
    '@/lib/supabase/admin': {
      createAdminClient() {
        state.clientCalls++;
        return {
          from(table: string) {
            assert.equal(table, 'shipping_box_templates');
            let operation: 'select' | 'insert' | 'update' | 'delete' = 'select';
            let values: Partial<Row> = {};
            let single = false;
            const filters = new Map<string, unknown>();
            type Builder = {
              select: (columns?: string) => Builder;
              order: (column: string) => Builder;
              limit: (count: number) => Builder;
              insert: (row: Partial<Row>) => Builder;
              update: (row: Partial<Row>) => Builder;
              delete: () => Builder;
              eq: (column: string, value: unknown) => Builder;
              single: () => Builder;
              maybeSingle: () => Builder;
              then: (resolve: (result: Result) => void) => void;
            };
            const builder: Builder = {
              select() { return builder; }, order() { return builder; }, limit() { return builder; },
              insert(row) { operation = 'insert'; values = row; return builder; },
              update(row) { operation = 'update'; values = row; return builder; },
              delete() { operation = 'delete'; return builder; },
              eq(column, value) { filters.set(column, value); return builder; },
              single() { single = true; return builder; }, maybeSingle() { single = true; return builder; },
              then(resolve) {
                state.beforeExecute?.();
                state.beforeExecute = null;
                if (state.errorCode) return resolve({ data: null, error: { code: state.errorCode, message: 'Private database details synthetic-secret' } });
                const matches = state.rows.filter(row => [...filters].every(([key, value]) => row[key as keyof Row] === value));
                let result: Row[];
                if (operation === 'select') result = [...matches];
                else if ((operation === 'insert' || operation === 'update') && state.rows.some(row => row.name.toLowerCase().trim() === String(values.name).toLowerCase().trim() && (operation === 'insert' || !matches.includes(row)))) {
                  return resolve({ data: null, error: { code: '23505', message: 'Private duplicate index details' } });
                } else if (operation === 'insert') {
                  const row = { ...values, id: `00000000-0000-4000-8000-${String(state.sequence++).padStart(12, '0')}`, updated_at: initialVersion } as Row;
                  state.rows.push(row); result = [row]; state.writes++;
                } else if (operation === 'update') {
                  result = matches.map(row => {
                    assert.equal('updated_at' in values, false, 'the server must let PostgreSQL generate the new version');
                    Object.assign(row, values, { updated_at: `2026-10-16T00:00:00.${String(++state.sequence).padStart(6, '0')}Z` });
                    state.writes++; return row;
                  });
                } else {
                  result = matches;
                  state.rows = state.rows.filter(row => !matches.includes(row));
                  state.writes += matches.length;
                }
                resolve({ data: single ? result[0] ?? null : result, error: null });
              },
            };
            return builder;
          },
        };
      },
    },
  }) as Record<Method, (request: NextRequest) => Promise<Response>>;
  async function request(method: Method, body: unknown = input, options: { auth?: boolean; cookie?: string; origin?: string | null; raw?: string; length?: string } = {}) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (options.auth !== false) headers.cookie = `fixture-admin=${options.cookie ?? 'valid-token'}`;
    if (options.origin !== null) headers.origin = options.origin ?? origin;
    if (options.length) headers['content-length'] = options.length;
    const response = await route[method](new NextRequest(`${origin}/api/admin/shipping/box-templates/`, {
      method, headers, ...(method === 'GET' ? {} : { body: options.raw ?? JSON.stringify(body) }),
    }));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return response;
  }
  return { state, seed, request };
}

test('box templates persist through create, list, edit, and delete using returned versions', async () => {
  const h = harness();
  assert.deepEqual(await (await h.request('GET')).json(), { templates: [] });
  const createdResponse = await h.request('POST', { ...input, name: '  Coffee case  ' });
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()).template;
  assert.deepEqual(created, { id: h.state.rows[0].id, ...input, updatedAt: initialVersion });
  assert.deepEqual(await (await h.request('GET')).json(), { templates: [created] });
  const changedResponse = await h.request('PATCH', { ...created, name: 'Large case', lengthIn: 18 });
  assert.equal(changedResponse.status, 200);
  const changed = (await changedResponse.json()).template;
  assert.equal(changed.name, 'Large case');
  assert.equal(changed.lengthIn, 18);
  assert.notEqual(changed.updatedAt, created.updatedAt);
  assert.equal((await h.request('DELETE', { id: changed.id, updatedAt: changed.updatedAt })).status, 200);
  assert.deepEqual(await (await h.request('GET')).json(), { templates: [] });
  assert.equal(h.state.writes, 3);
});

test('authentication protects reads and writes before database access', async () => {
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE'] as const) {
    for (const scenario of ['missing-cookie', 'wrong-cookie', 'unconfigured-admin']) {
      const h = harness();
      if (scenario === 'unconfigured-admin') h.state.expectedToken = '';
      assert.equal((await h.request(method, {}, { auth: scenario !== 'missing-cookie', cookie: scenario === 'wrong-cookie' ? 'wrong' : undefined })).status, 401);
      assert.equal(h.state.clientCalls, 0);
    }
  }
});

test('writes require same origin and writable preview but reads remain available', async () => {
  for (const method of ['POST', 'PATCH', 'DELETE'] as const) {
    for (const requestOrigin of [null, 'https://attacker.test']) {
      const h = harness();
      assert.equal((await h.request(method, {}, { origin: requestOrigin })).status, 403);
      assert.equal(h.state.clientCalls, 0);
    }
    const h = harness(); h.state.preview = true;
    assert.equal((await h.request(method, {})).status, 409);
    assert.equal(h.state.clientCalls, 0);
  }
  const h = harness(); h.state.preview = true;
  assert.equal((await h.request('GET', {}, { origin: null })).status, 200);
});

test('strict name and dimensions validation rejects bad input without storing anything', async () => {
  const invalid = [
    null, [], 1, 'box', {}, { ...input, name: ' ' }, { ...input, name: 'x'.repeat(81) },
    { ...input, name: 42 }, { ...input, lengthIn: '12' }, { ...input, widthIn: 0 },
    { ...input, heightIn: -1 }, { ...input, lengthIn: 108.01 }, { ...input, widthIn: null },
    { ...input, heightIn: true }, { name: 'Missing dimension', lengthIn: 1, widthIn: 1 },
  ];
  for (const body of invalid) {
    const h = harness();
    assert.equal((await h.request('POST', body)).status, 400, JSON.stringify(body));
    assert.equal(h.state.writes, 0);
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const editing = harness(); const original = editing.seed();
      assert.equal((await editing.request('PATCH', { ...body, id: templateId, updatedAt: initialVersion })).status, 400);
      assert.deepEqual(editing.state.rows, [original]);
      assert.equal(editing.state.writes, 0);
    }
  }
  const h = harness();
  assert.equal((await h.request('POST', { name: 'x'.repeat(80), lengthIn: 108, widthIn: 0.1, heightIn: 108 })).status, 201);
});

test('malformed JSON and real UTF-8 body size are checked for every write', async () => {
  for (const method of ['POST', 'PATCH', 'DELETE'] as const) {
    const malformed = harness();
    assert.equal((await malformed.request(method, {}, { raw: '{invalid' })).status, 400);
    assert.equal(malformed.state.writes, 0);
    const oversized = harness();
    assert.equal((await oversized.request(method, {}, { raw: JSON.stringify({ padding: '界'.repeat(1500) }), length: '1' })).status, 413);
    assert.equal(oversized.state.writes, 0);
  }
});

test('edits and deletes require valid IDs and original timestamp tokens', async () => {
  for (const method of ['PATCH', 'DELETE'] as const) {
    for (const version of [{}, { id: templateId }, { id: 'bad-id', updatedAt: initialVersion }, { id: templateId, updatedAt: 'yesterday' }, { id: templateId, updatedAt: 123 }, { id: templateId, updatedAt: '2026-02-30T00:00:00Z' }, { id: templateId, updatedAt: '2026-10-16T25:00:00Z' }]) {
      const h = harness(); h.seed();
      assert.equal((await h.request(method, { ...input, ...version })).status, 400);
      assert.equal(h.state.writes, 0);
    }
  }
});

test('stale edits and deletes cannot overwrite another admin even when state changes during the request', async () => {
  for (const method of ['PATCH', 'DELETE'] as const) {
    const h = harness(); h.seed();
    h.state.beforeExecute = () => { h.state.rows[0].name = 'Other admin edit'; h.state.rows[0].updated_at = '2026-10-16T00:00:00.000002Z'; };
    const response = await h.request(method, { ...input, id: templateId, updatedAt: initialVersion });
    assert.equal(response.status, 409);
    assert.equal(h.state.rows[0].name, 'Other admin edit');
    assert.equal(h.state.writes, 0);
    assert.equal((await h.request(method, { ...input, id: '22222222-2222-4222-8222-222222222222', updatedAt: initialVersion })).status, 409);
  }
});

test('duplicate names return conflicts and database failures never leak internal details', async () => {
  const duplicate = harness(); duplicate.seed();
  assert.equal((await duplicate.request('POST', { ...input, name: '  COFFEE CASE  ' })).status, 409);
  assert.equal(duplicate.state.rows.length, 1);
  const other = (await (await duplicate.request('POST', { ...input, name: 'Other box' })).json()).template;
  const conflictingEdit = await duplicate.request('PATCH', { ...other, name: 'coffee case' });
  assert.equal(conflictingEdit.status, 409);
  assert.match(await conflictingEdit.text(), /name/i);
  assert.equal(duplicate.state.rows[1].name, 'Other box');
  for (const code of ['42P01', 'PGRST205', 'XX000']) {
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE'] as const) {
      const h = harness(); h.seed(); h.state.errorCode = code;
      const response = await h.request(method, { ...input, id: templateId, updatedAt: initialVersion });
      assert.equal(response.status, code === 'XX000' ? 500 : 503);
      assert.doesNotMatch(await response.text(), /Private|synthetic-secret/);
      assert.equal(h.state.writes, 0);
    }
  }
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE'] as const) {
    const h = harness(); h.seed();
    h.state.beforeExecute = () => { throw new Error('Private connection failure synthetic-secret'); };
    const response = await h.request(method, { ...input, id: templateId, updatedAt: initialVersion });
    assert.equal(response.status, 500);
    assert.doesNotMatch(await response.text(), /Private|synthetic-secret/);
    assert.equal(h.state.writes, 0);
  }
});
