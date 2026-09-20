import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

async function main() {
  const db = new PGlite();
  await db.exec(
    'CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE DOMAIN citext AS text;',
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
  await db.close();
  console.log(
    'PASS: existing vendor migration, terms, warehouse uniqueness, PO columns, and warehouse RLS',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
