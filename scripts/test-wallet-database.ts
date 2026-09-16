import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

async function main() {
  const db = new PGlite();
  // Minimal Supabase auth bootstrap, then the repository's real order/payment schema.
  await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE DOMAIN citext AS text;`);
  for (const name of ['0001_initial_schema.sql', '0004_add_cart_hash.sql', '0005_payment_audit_log.sql', '20260916211425_wallet_checkout.sql']) {
    const sql = (await readFile(`supabase/migrations/${name}`, 'utf8')).replace('CREATE EXTENSION IF NOT EXISTS citext;', '');
    await db.exec(sql);
  }
  const product = randomUUID();
  // Populate the exact required product columns from this repository's schema.
  await db.query(`INSERT INTO products(id,sku,name,slug,retail_price) VALUES($1,'WALLET-TEST','Test beverage','wallet-test',89.95)`, [product]);
  const order = { customer_email: 'test@example.invalid', subtotal: 89.95, shipping_cost: 0, tax: 0, total: 89.95,
    shipping_address: {}, billing_address: {}, business_name: null, is_business: false, client_ip: 'test' };
  const lines = [{ product_id: product, product_sku: 'WALLET-TEST', product_name: 'Test beverage', quantity: 1,
    unit_price: 89.95, line_subtotal: 89.95, unit_wholesale_cost: null, assigned_vendor_id: null }];
  const create = (id: string, fingerprint = 'browser-owner-and-cart', items = lines) => db.query<{ a: { order_id: string } }>(
    'SELECT prepare_wallet_checkout($1,$2,$3,$4,$5,$6) AS a', [id, fingerprint, 'paypal', 'sandbox', order, items]);
  const id = randomUUID();
  const first = (await create(id)).rows[0].a;
  assert.equal((await create(id)).rows[0].a.order_id, first.order_id);
  await assert.rejects(create(id, 'different-browser-or-cart'));
  assert.equal((await db.query<{ n: number }>('SELECT count(*)::int n FROM orders')).rows[0].n, 1);
  await assert.rejects(create(randomUUID(), 'bad-product', [{ ...lines[0], product_id: randomUUID() }]));
  assert.equal((await db.query<{ n: number }>('SELECT count(*)::int n FROM orders')).rows[0].n, 1, 'failed item insert rolls back order');
  await db.query('UPDATE wallet_checkout_attempts SET provider_order_id=$1 WHERE id=$2', ['PAYPAL-ORDER1', id]);
  const finish = (amount: number | null, currency: string | null, tx = 'CAPTURE-TEST') => db.query<{ result: string }>(
    'SELECT finalize_wallet_checkout($1,$2,$3,$4) AS result', [id, tx, amount, currency]);
  for (const [amount, currency] of [[1, 'USD'], [89.95, 'EUR'], [null, 'USD'], [89.95, null]] as const) await assert.rejects(finish(amount, currency));
  assert.equal((await db.query<{ status: string }>('SELECT status FROM orders')).rows[0].status, 'pending');
  assert.equal((await finish(89.95, 'USD')).rows[0].result, 'finalized');
  assert.equal((await finish(89.95, 'USD')).rows[0].result, 'already_final');
  await assert.rejects(finish(89.95, 'USD', 'OTHER-CAPTURE'));
  assert.equal((await db.query<{ n: number }>('SELECT count(*)::int n FROM payments')).rows[0].n, 1);
  assert.equal((await db.query<{ status: string }>('SELECT status FROM orders')).rows[0].status, 'paid');
  const secondId = randomUUID(); const second = (await create(secondId)).rows[0].a;
  await db.query('UPDATE wallet_checkout_attempts SET provider_order_id=$1 WHERE id=$2', ['PAYPAL-ORDER2', secondId]);
  await assert.rejects(db.query('SELECT finalize_wallet_checkout($1,$2,$3,$4)', [secondId, 'CAPTURE-TEST', 89.95, 'USD']));
  assert.equal((await db.query<{ status: string }>('SELECT status FROM orders WHERE id=$1', [second.order_id])).rows[0].status, 'pending', 'replayed transaction rolls back finalization');
  const permissions = await db.query<{ access: boolean; rpc: boolean; rls: boolean }>(`SELECT
    has_table_privilege('anon','wallet_checkout_attempts','SELECT') AS access,
    has_function_privilege('authenticated','public.finalize_wallet_checkout(uuid,text,numeric,text)','EXECUTE') AS rpc,
    (SELECT relrowsecurity FROM pg_class WHERE relname='wallet_checkout_attempts') AS rls`);
  assert.deepEqual(permissions.rows[0], { access: false, rpc: false, rls: true });
  await db.close();
  console.log('PASS: real-schema transaction rollback, retry reuse, ownership conflict, strict money checks, duplicate finalization, capture replay, and RLS/RPC permissions');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
