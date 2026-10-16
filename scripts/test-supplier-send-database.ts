import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

type Fixture = { poId: string; orderId: string; itemId: string; warehouseIds: string[] };
type ClaimedPo = { id: string; email_subject: string; email_body: string; email_send_started_at: Date };

async function main() {
  const db = new PGlite();
  let passed = 0;
  const failures: string[] = [];
  async function test(name: string, run: () => Promise<void>) {
    try {
      await run();
      passed++;
      console.log(`PASS: ${name}`);
    } catch (error) {
      failures.push(name);
      console.error(`FAIL: ${name}`, error);
    }
  }
  async function migration(name: string) {
    await db.exec((await readFile(`supabase/migrations/${name}`, 'utf8'))
      .replace('CREATE EXTENSION IF NOT EXISTS citext;', ''));
  }
  try {
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE DOMAIN citext AS text;
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role BYPASSRLS;
    `);
    await migration('0001_initial_schema.sql');
    await migration('20261015023211_local_shipping.sql');
    await migration('20261015074104_shipping_state_idempotency.sql');
    await migration('20261015230709_supplier_po_send_claim.sql');

    await test('claim migration works without the optional vendor warehouse migration and is repeatable', async () => {
      await migration('20261015230709_supplier_po_send_claim.sql');
      const columns = (await db.query<{ column_name: string; is_nullable: string }>(`
        SELECT column_name,is_nullable FROM information_schema.columns
        WHERE table_schema='public' AND table_name='vendor_orders'
          AND column_name IN ('email_send_started_at','warehouse_id','sent_by')
      `)).rows;
      assert.deepEqual(columns, [{ column_name: 'email_send_started_at', is_nullable: 'YES' }]);
    });

    await migration('0006_vendor_warehouses_and_po.sql');

    async function fixture(status = 'pending'): Promise<Fixture> {
      const vendorId = (await db.query<{ id: string }>(`
        INSERT INTO vendors(name,slug,contact_email)
        VALUES('Synthetic supplier',gen_random_uuid()::text,'supplier@example.invalid') RETURNING id
      `)).rows[0].id;
      const warehouseIds = (await db.query<{ id: string }>(`
        INSERT INTO vendor_warehouses(vendor_id,label) VALUES($1,'First'),($1,'Second') RETURNING id
      `, [vendorId])).rows.map(row => row.id);
      const orderId = (await db.query<{ id: string }>(`
        INSERT INTO orders(customer_email,status,subtotal,total,shipping_address,billing_address)
        VALUES('customer@example.invalid','paid',10,10,'{}','{}') RETURNING id
      `)).rows[0].id;
      const itemId = (await db.query<{ id: string }>(`
        INSERT INTO order_items(order_id,product_sku,product_name,quantity,unit_price,line_subtotal,assigned_vendor_id)
        VALUES($1,'SUPPLIER-CLAIM','Synthetic item',1,10,10,$2) RETURNING id
      `, [orderId, vendorId])).rows[0].id;
      const poId = (await db.query<{ id: string }>(`
        INSERT INTO vendor_orders(order_id,vendor_id,status,email_subject,email_body,warehouse_id)
        VALUES($1,$2,$3::vendor_order_status,'Original subject','Original body',$4) RETURNING id
      `, [orderId, vendorId, status, warehouseIds[0]])).rows[0].id;
      return { poId, orderId, itemId, warehouseIds };
    }

    // These predicates mirror the routes' atomic UPDATE ... RETURNING operations.
    // PGlite queues callers on one connection; both interleaving orders are tested
    // explicitly below rather than claiming multi-connection lock coverage.
    const claimTime = '2026-10-15T23:15:00.123Z';
    const otherTime = '2026-10-15T23:15:01.456Z';
    const claim = async (f: Fixture, timestamp = claimTime, subject = 'Claimed subject', body = 'Claimed body') =>
      (await db.query<ClaimedPo>(`
        UPDATE vendor_orders SET email_subject=$2,email_body=$3,warehouse_id=$4,email_send_started_at=$5
        WHERE id=$1 AND status='pending' AND email_send_started_at IS NULL
        RETURNING id,email_subject,email_body,email_send_started_at
      `, [f.poId, subject, body, f.warehouseIds[0], timestamp])).rows;
    const save = async (f: Fixture) => (await db.query(`
      UPDATE vendor_orders SET email_subject='Stale edited subject',email_body='Stale edited body',warehouse_id=$2
      WHERE id=$1 AND status='pending' AND email_send_started_at IS NULL RETURNING id
    `, [f.poId, f.warehouseIds[1]])).rows;
    const cancel = async (f: Fixture) => (await db.query(`
      UPDATE vendor_orders SET status='cancelled'
      WHERE id=$1 AND status='pending' AND email_send_started_at IS NULL RETURNING id
    `, [f.poId])).rows;
    const finalize = async (f: Fixture, timestamp: string, messageId = 'synthetic-message') =>
      (await db.query(`
        UPDATE vendor_orders SET status='sent',email_sent_at=now(),email_message_id=$3,sent_by='test-admin'
        WHERE id=$1 AND status='pending' AND email_send_started_at=$2::timestamptz RETURNING id
      `, [f.poId, timestamp, messageId])).rows;
    const snapshot = async (f: Fixture) => (await db.query(`
      SELECT status,email_subject,email_body,warehouse_id,email_send_started_at,email_sent_at,email_message_id,sent_by
      FROM vendor_orders WHERE id=$1
    `, [f.poId])).rows[0];
    const reserveLocal = async (f: Fixture) => db.query(`
      SELECT shipping_mutate($1,'reserve',$2::jsonb)
    `, [f.orderId, JSON.stringify({ items: [{ orderItemId: f.itemId, quantity: 1 }] })]);

    await test('only one competing send claims the PO and returns the exact persisted email payload', async () => {
      const f = await fixture();
      const results = await Promise.all([
        claim(f, claimTime, 'First subject', 'First body'),
        claim(f, otherTime, 'Second subject', 'Second body'),
      ]);
      assert.equal(results.filter(rows => rows.length === 1).length, 1);
      const winner = results.flat()[0];
      const stored = await snapshot(f);
      assert.equal(stored.email_subject, winner.email_subject);
      assert.equal(stored.email_body, winner.email_body);
      assert.deepEqual(stored.email_send_started_at, winner.email_send_started_at);
      assert.equal((await claim(f, otherTime, 'Retry subject', 'Retry body')).length, 0);
      assert.deepEqual(await snapshot(f), stored);
    });

    await test('a send claim beats stale cancellation and saves while keeping supplier quantities reserved', async () => {
      const f = await fixture();
      assert.equal((await claim(f)).length, 1);
      const original = await snapshot(f);
      assert.equal((await cancel(f)).length, 0);
      assert.equal((await save(f)).length, 0);
      assert.deepEqual(await snapshot(f), original);
      await assert.rejects(reserveLocal(f), /Resolve the supplier PO/);
    });

    await test('cancellation winning first prevents sending and permits local reservation', async () => {
      const f = await fixture();
      assert.equal((await cancel(f)).length, 1);
      const cancelled = await snapshot(f);
      assert.equal((await claim(f)).length, 0);
      assert.equal((await save(f)).length, 0);
      assert.deepEqual(await snapshot(f), cancelled);
      assert.equal((await reserveLocal(f)).rows.length, 1);
    });

    await test('an earlier draft save does not overwrite the payload captured by a later send', async () => {
      const f = await fixture();
      assert.equal((await save(f)).length, 1);
      const claimed = await claim(f, claimTime, 'Final subject', 'Final reviewed body');
      assert.equal(claimed[0].email_subject, 'Final subject');
      assert.equal(claimed[0].email_body, 'Final reviewed body');
      assert.equal((await save(f)).length, 0);
      assert.equal((await snapshot(f)).warehouse_id, f.warehouseIds[0]);
    });

    await test('only the persisted claim can finalize and successful finalization never frees it', async () => {
      const f = await fixture();
      assert.equal((await finalize(f, claimTime)).length, 0);
      const claimed = (await claim(f))[0];
      const pending = await snapshot(f);
      assert.equal((await finalize(f, otherTime)).length, 0);
      assert.deepEqual(await snapshot(f), pending);
      assert.equal((await finalize(f, claimed.email_send_started_at.toISOString())).length, 1);
      const sent = await snapshot(f);
      assert.equal(sent.status, 'sent');
      assert.equal(sent.email_message_id, 'synthetic-message');
      assert.ok(sent.email_sent_at);
      assert.deepEqual(sent.email_send_started_at, claimed.email_send_started_at);
      assert.equal((await finalize(f, claimTime, 'duplicate-message')).length, 0);
      assert.equal((await cancel(f)).length, 0);
      assert.equal((await save(f)).length, 0);
      assert.equal((await claim(f, otherTime)).length, 0);
      assert.deepEqual(await snapshot(f), sent);
    });

    await test('a failed database finalization rolls back metadata and leaves the send claim reserved', async () => {
      // Inject a server-side failure after the email claim has committed. No
      // provider is involved, and this trigger exists only in this in-memory DB.
      await db.exec(`
        CREATE FUNCTION fail_fixture_finalization() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.email_message_id='simulate-database-failure' THEN
            RAISE EXCEPTION 'Synthetic finalization failure';
          END IF;
          RETURN NEW;
        END $$;
        CREATE TRIGGER fail_fixture_finalization BEFORE UPDATE ON vendor_orders
          FOR EACH ROW EXECUTE FUNCTION fail_fixture_finalization();
      `);
      const f = await fixture();
      const claimed = (await claim(f))[0];
      const pending = await snapshot(f);
      await assert.rejects(finalize(f, claimed.email_send_started_at.toISOString(), 'simulate-database-failure'), /Synthetic finalization failure/);
      assert.deepEqual(await snapshot(f), pending);
      assert.equal((await cancel(f)).length, 0);
      assert.equal((await save(f)).length, 0);
      assert.equal((await claim(f, otherTime)).length, 0);
      await assert.rejects(reserveLocal(f), /Resolve the supplier PO/);
    });

    await test('all non-draft states reject new claims, edits, and stale cancellation', async () => {
      for (const status of ['sent', 'confirmed', 'shipped', 'delivered', 'cancelled']) {
        const f = await fixture(status);
        const original = await snapshot(f);
        assert.equal((await claim(f)).length, 0, status);
        assert.equal((await save(f)).length, 0, status);
        assert.equal((await cancel(f)).length, 0, status);
        assert.deepEqual(await snapshot(f), original);
      }
    });

    await test('a pending send claim cannot bypass verification by marking the supplier PO shipped', async () => {
      const f = await fixture();
      await claim(f);
      const pending = await snapshot(f);
      await assert.rejects(db.query('SELECT shipping_mark_vendor_shipped($1)', [f.poId]), /send|verify|pending|in progress/i);
      assert.deepEqual(await snapshot(f), pending);
      assert.equal((await db.query<{ status: string }>('SELECT fulfillment_status::text AS status FROM orders WHERE id=$1', [f.orderId])).rows[0].status, 'unfulfilled');
    });

    await test('unclaimed pending POs and finalized sent claims retain the existing dispatch path', async () => {
      const unclaimed = await fixture();
      await db.query('SELECT shipping_mark_vendor_shipped($1)', [unclaimed.poId]);
      assert.equal((await snapshot(unclaimed)).status, 'shipped');

      const sent = await fixture();
      const claimed = (await claim(sent))[0];
      await finalize(sent, claimed.email_send_started_at.toISOString());
      await db.query('SELECT shipping_mark_vendor_shipped($1)', [sent.poId]);
      const dispatched = await snapshot(sent);
      assert.equal(dispatched.status, 'shipped');
      assert.deepEqual(dispatched.email_send_started_at, claimed.email_send_started_at);
    });

    await test('supplier dispatch function stays invoker-only and executable only by service_role', async () => {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        const access = (await db.query<{ allowed: boolean }>(
          "SELECT has_function_privilege($1,'public.shipping_mark_vendor_shipped(uuid)','EXECUTE') AS allowed", [role],
        )).rows[0].allowed;
        assert.equal(access, role === 'service_role');
      }
      const properties = (await db.query<{ definer: boolean; config: string[] }>(`
        SELECT prosecdef AS definer,proconfig AS config FROM pg_proc
        WHERE oid='public.shipping_mark_vendor_shipped(uuid)'::regprocedure
      `)).rows[0];
      assert.equal(properties.definer, false);
      assert.ok(properties.config.includes('search_path=""'));
    });
  } finally {
    await db.close();
  }
  console.log(`${passed} supplier send database checks passed; ${failures.length} failed.`);
  if (failures.length) throw new Error(`Failed checks: ${failures.join('; ')}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
