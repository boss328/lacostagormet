import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

async function main() {
  const db = new PGlite();
  try {
    await db.exec(
      `CREATE ROLE anon;
       CREATE ROLE authenticated;
       CREATE ROLE service_role BYPASSRLS;
       GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
       ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
       CREATE SCHEMA auth;
       CREATE TABLE auth.users(id uuid PRIMARY KEY);
       CREATE DOMAIN citext AS text;`,
    );
    for (const name of [
      '0001_initial_schema.sql',
      '0006_vendor_warehouses_and_po.sql',
    ]) {
      await db.exec(
        (await readFile(`supabase/migrations/${name}`, 'utf8')).replace(
          'CREATE EXTENSION IF NOT EXISTS citext;',
          '',
        ),
      );
    }
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const inherited = await db.query<{ allowed: boolean }>(
        "SELECT has_table_privilege($1,'public.vendor_warehouses','TRUNCATE') AS allowed",
        [role],
      );
      assert.equal(inherited.rows[0].allowed, true, `${role} starts with the legacy default table grants`);
    }
    const accessMigration = await readFile('supabase/migrations/20261016003642_vendor_warehouse_admin_access.sql', 'utf8');
    await db.exec(accessMigration);
    await db.exec(accessMigration); // ACL normalization is safe to repeat.
    for (const role of ['anon', 'authenticated']) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
        const access = await db.query<{ allowed: boolean }>(
          "SELECT has_table_privilege($1,'public.vendor_warehouses',$2) AS allowed",
          [role, privilege],
        );
        assert.equal(access.rows[0].allowed, false, `${role} must not retain ${privilege}`);
      }
    }
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      const access = await db.query<{ allowed: boolean }>(
        "SELECT has_table_privilege('service_role','public.vendor_warehouses',$1) AS allowed",
        [privilege],
      );
      assert.equal(access.rows[0].allowed, true, `service_role needs ${privilege}`);
    }
    const vendor = (
      await db.query<{ id: string }>(
          "INSERT INTO vendors(name,slug,terms) VALUES('Review vendor','ui-test','Net 30') RETURNING id",
      )
    ).rows[0].id;
    await db.query(
      "INSERT INTO vendor_warehouses(vendor_id,label,is_primary) VALUES($1,'West',true)",
      [vendor],
    );
    await assert.rejects(
      db.query(
        "INSERT INTO vendor_warehouses(vendor_id,label,is_primary) VALUES($1,'East',true)",
        [vendor],
      ),
    );
    const fields = await db.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name='vendor_orders' AND column_name IN ('warehouse_id','sent_by','total_wholesale')",
    );
    assert.equal(fields.rows.length, 3);
    const rls = await db.query<{ enabled: boolean }>(
      "SELECT relrowsecurity enabled FROM pg_class WHERE relname='vendor_warehouses'",
    );
    assert.equal(rls.rows[0].enabled, true);

    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      try {
        for (const query of [
          'SELECT * FROM public.vendor_warehouses',
          `INSERT INTO public.vendor_warehouses(vendor_id,label) VALUES('${vendor}','Denied')`,
          "UPDATE public.vendor_warehouses SET label='Denied'",
          'DELETE FROM public.vendor_warehouses',
          'TRUNCATE public.vendor_warehouses',
        ]) {
          await assert.rejects(db.query(query), /permission denied/, `${role} cannot execute ${query.split(' ')[0]}`);
        }
      } finally {
        await db.exec('RESET ROLE');
      }
    }
    await db.exec('SET ROLE service_role');
    try {
      const created = (await db.query<{ id: string }>(
        "INSERT INTO public.vendor_warehouses(vendor_id,label) VALUES($1,'Admin CRUD') RETURNING id",
        [vendor],
      )).rows[0].id;
      assert.equal((await db.query('SELECT id FROM public.vendor_warehouses WHERE id=$1', [created])).rows.length, 1);
      const updated = await db.query<{ label: string }>(
        "UPDATE public.vendor_warehouses SET label='Admin updated' WHERE id=$1 RETURNING label",
        [created],
      );
      assert.equal(updated.rows[0].label, 'Admin updated');
      assert.equal((await db.query('DELETE FROM public.vendor_warehouses WHERE id=$1 RETURNING id', [created])).rows.length, 1);
      assert.equal((await db.query('SELECT id FROM public.vendor_warehouses WHERE id=$1', [created])).rows.length, 0);
    } finally {
      await db.exec('RESET ROLE');
    }
    console.log(
      'PASS: vendor migration, terms, warehouse uniqueness, PO columns, RLS, anonymous/authenticated privilege denial including TRUNCATE, and service-role CRUD',
    );
  } finally {
    await db.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
