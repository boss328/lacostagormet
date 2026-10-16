import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

type Box = { id: string; name: string; length_in: number; width_in: number; height_in: number; version: string };

async function main() {
  const db = new PGlite();
  let passed = 0;
  const failures: string[] = [];
  let sequence = 0;
  const columns = `id,name,length_in,width_in,height_in,to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS version`;
  async function test(name: string, run: () => Promise<void>) {
    try { await run(); passed++; console.log(`PASS: ${name}`); }
    catch (error) { failures.push(name); console.error(`FAIL: ${name}`, error); }
  }
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role BYPASSRLS;
      GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated;
    `);
    await db.exec(await readFile('supabase/migrations/20261016002226_shipping_box_templates.sql', 'utf8'));
    await db.exec('SET ROLE service_role');
    const insert = async (name = `Synthetic box ${++sequence}`, dimensions: unknown[] = [12, 9.5, 6], timestamp = '2026-10-16T00:00:00.123456Z') =>
      (await db.query<Box>(`
        INSERT INTO shipping_box_templates(name,length_in,width_in,height_in,updated_at)
        VALUES($1,$2,$3,$4,$5::timestamptz) RETURNING ${columns}
      `, [name, ...dimensions, timestamp])).rows[0];
    const read = async (id: string) => (await db.query<Box>(`SELECT ${columns} FROM shipping_box_templates WHERE id=$1`, [id])).rows[0];
    const update = async (box: Box, name: string) => (await db.query<Box>(`
      UPDATE shipping_box_templates SET name=$3
      WHERE id=$1 AND updated_at=$2::timestamptz RETURNING ${columns}
    `, [box.id, box.version, name])).rows;
    const remove = async (box: Box) => (await db.query(`
      DELETE FROM shipping_box_templates WHERE id=$1 AND updated_at=$2::timestamptz RETURNING id
    `, [box.id, box.version])).rows;

    await test('service role persists dimensions and can create, read, edit, and delete a template', async () => {
      const box = await insert();
      assert.match(box.id, /^[0-9a-f-]{36}$/);
      assert.equal(box.length_in, 12);
      assert.equal(box.width_in, 9.5);
      assert.equal(box.height_in, 6);
      assert.equal(box.version, '2026-10-16T00:00:00.123456Z');
      assert.deepEqual(await read(box.id), box);
      const changed = (await update(box, 'Revised synthetic box'))[0];
      assert.equal(changed.name, 'Revised synthetic box');
      assert.notEqual(changed.version, box.version);
      assert.equal((await remove(changed)).length, 1);
      assert.equal(await read(box.id), undefined);
    });

    await test('dimensions reject zero, negative, excessive, null, NaN, and infinite values', async () => {
      for (const index of [0, 1, 2]) {
        for (const value of [0, -1, 108.01, null, 'NaN', 'Infinity', '-Infinity']) {
          const dimensions: unknown[] = [1, 1, 1]; dimensions[index] = value;
          await assert.rejects(insert(undefined, dimensions), /constraint|null value/);
        }
      }
      const boundary = await insert(undefined, [0.001, 108, 108]);
      assert.equal(boundary.length_in, 0.001);
      assert.equal(boundary.width_in, 108);
    });

    await test('name constraints reject empty, untrimmed, long, and case-insensitive duplicates', async () => {
      for (const name of ['', '   ', ' Leading', 'Trailing ', 'x'.repeat(81)]) {
        await assert.rejects(insert(name), /check constraint/);
      }
      await insert('x'.repeat(80));
      const original = await insert('Coffee Case');
      await assert.rejects(insert('COFFEE CASE'), /unique constraint/);
      const other = await insert('Different case');
      await assert.rejects(update(other, 'coffee case'), /unique constraint/);
      assert.deepEqual(await read(original.id), original);
      assert.deepEqual(await read(other.id), other);
    });

    await test('optimistic updates and deletes reject stale or foreign versions without losing current data', async () => {
      const original = await insert();
      const other = await insert();
      const current = (await update(original, 'Newer reviewed dimensions'))[0];
      assert.equal((await update(original, 'Stale overwrite')).length, 0);
      assert.equal((await remove(original)).length, 0);
      assert.equal((await update({ ...current, version: other.version }, 'Wrong version')).length, 0);
      assert.deepEqual(await read(original.id), current);
      assert.equal((await remove(current)).length, 1);
      assert.equal((await update(current, 'Deleted box')).length, 0);
    });

    await test('version trigger advances in one transaction and ignores client-supplied replacement timestamps', async () => {
      const future = await insert(undefined, [1, 2, 3], '2099-01-01T00:00:00.123456Z');
      await db.exec('BEGIN');
      try {
        const first = (await db.query<Box>(`
          UPDATE shipping_box_templates SET updated_at='2000-01-01',name='First same-transaction edit'
          WHERE id=$1 RETURNING ${columns}
        `, [future.id])).rows[0];
        const second = (await db.query<Box>(`
          UPDATE shipping_box_templates SET updated_at='2000-01-01',name='Second same-transaction edit'
          WHERE id=$1 RETURNING ${columns}
        `, [future.id])).rows[0];
        assert.equal(first.version, '2099-01-01T00:00:00.123457Z');
        assert.equal(second.version, '2099-01-01T00:00:00.123458Z');
        assert.equal((await update(first, 'Stale same-transaction edit')).length, 0);
        await db.exec('COMMIT');
      } catch (error) { await db.exec('ROLLBACK'); throw error; }
    });

    await test('RLS and ACLs deny anonymous/authenticated reads and mutations, including legacy default grants', async () => {
      const box = await insert();
      assert.equal((await db.query<{ enabled: boolean }>(`
        SELECT relrowsecurity AS enabled FROM pg_class WHERE oid='public.shipping_box_templates'::regclass
      `)).rows[0].enabled, true);
      for (const role of ['anon', 'authenticated', 'service_role']) {
        for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
          assert.equal((await db.query<{ allowed: boolean }>(
            'SELECT has_table_privilege($1,$2,$3) AS allowed', [role, 'public.shipping_box_templates', privilege],
          )).rows[0].allowed, role === 'service_role', `${role} ${privilege}`);
        }
        assert.equal((await db.query<{ allowed: boolean }>(
          "SELECT has_function_privilege($1,'public.shipping_touch_box_template()','EXECUTE') AS allowed", [role],
        )).rows[0].allowed, role === 'service_role');
      }
      for (const role of ['anon', 'authenticated']) {
        await db.exec(`RESET ROLE; SET ROLE ${role}`);
        try {
          await assert.rejects(read(box.id), /permission denied/);
          await assert.rejects(insert(), /permission denied/);
          await assert.rejects(update(box, 'Unauthorized change'), /permission denied/);
          await assert.rejects(remove(box), /permission denied/);
        } finally { await db.exec('RESET ROLE; SET ROLE service_role'); }
      }
      assert.deepEqual(await read(box.id), box);
      const functionProperties = (await db.query<{ definer: boolean; config: string[] }>(`
        SELECT prosecdef AS definer,proconfig AS config FROM pg_proc
        WHERE oid='public.shipping_touch_box_template()'::regprocedure
      `)).rows[0];
      assert.equal(functionProperties.definer, false);
      assert.ok(functionProperties.config.includes('search_path=""'));
    });
  } finally { await db.close(); }
  console.log(`${passed} box-template database checks passed; ${failures.length} failed.`);
  if (failures.length) throw new Error(`Failed checks: ${failures.join('; ')}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
