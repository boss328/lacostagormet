import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

type Shipment = {
  id: string;
  status: string;
  claimed?: boolean;
  carrier: string | null;
  service: string | null;
  postage: number | null;
  shipped_at: string | null;
  notification_state: string;
};

type Fixture = { orderId: string; itemIds: string[] };

async function main() {
  const db = new PGlite();
  let passed = 0;
  const failures: string[] = [];
  try {
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE DOMAIN citext AS text;
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role BYPASSRLS;
    `);
    await db.exec(
      (await readFile('supabase/migrations/0001_initial_schema.sql', 'utf8'))
        .replace('CREATE EXTENSION IF NOT EXISTS citext;', ''),
    );
    // Model the existing Supabase service grants and legacy default table grants.
    // The shipping migration must revoke the latter for its two private tables.
    await db.exec(`
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT ALL ON TABLES TO anon, authenticated, service_role;
    `);
    await db.exec(await readFile('supabase/migrations/20261015023211_local_shipping.sql', 'utf8'));
    await db.exec('SET ROLE service_role');

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

    async function fixture(quantities = [2], status = 'paid', vendors: (string | null)[] = []): Promise<Fixture> {
      const orderId = (await db.query<{ id: string }>(`
        INSERT INTO orders(customer_email,status,subtotal,total,shipping_address,billing_address)
        VALUES('shipping-test@example.invalid',$1::order_status,20,20,'{"city":"Test"}','{}') RETURNING id
      `, [status])).rows[0].id;
      const itemIds: string[] = [];
      for (const [index, quantity] of quantities.entries()) {
        itemIds.push((await db.query<{ id: string }>(`
          INSERT INTO order_items(order_id,product_sku,product_name,quantity,unit_price,line_subtotal,assigned_vendor_id)
          VALUES($1,$2,'Shipping fixture',$3,10,$3*10,$4) RETURNING id
        `, [orderId, `TEST-${index}`, quantity, vendors[index] ?? null])).rows[0].id);
      }
      return { orderId, itemIds };
    }

    async function mutate(orderId: string, action: string, payload: Record<string, unknown>) {
      return (await db.query<{ shipment: Shipment }>(
        'SELECT public.shipping_mutate($1::uuid,$2,$3::jsonb) AS shipment',
        [orderId, action, JSON.stringify(payload)],
      )).rows[0].shipment;
    }

    const items = (orderItemId: string, quantity = 1) => [{ orderItemId, quantity }];
    const reserve = (f: Fixture, quantity = 1, index = 0) =>
      mutate(f.orderId, 'reserve', { items: items(f.itemIds[index], quantity), parcel: { weight: 16 } });
    const manual = (f: Fixture, quantity: number, tracking: string, index = 0) =>
      mutate(f.orderId, 'manual', { items: items(f.itemIds[index], quantity), tracking_number: tracking, carrier: 'UPS' });
    const legacyManual = async (orderId: string, tracking: string) =>
      (await db.query<{ changed: boolean }>('SELECT shipping_mark_order_manual($1,$2) AS changed', [orderId, tracking])).rows[0].changed;
    const rates = [{ rateId: 'quoted-rate', carrier: 'USPS', service: 'Ground Advantage', amount: 8.45 }];

    async function quoted(f: Fixture) {
      const shipment = await reserve(f);
      await mutate(f.orderId, 'save_rates', { shipmentId: shipment.id, rates, providerShipmentId: `provider-${shipment.id}` });
      return shipment;
    }

    async function fulfillment(orderId: string) {
      return (await db.query<{ status: string }>('SELECT fulfillment_status::text AS status FROM orders WHERE id=$1', [orderId])).rows[0].status;
    }

    async function counts(orderId: string) {
      return (await db.query<{ shipments: number; items: number }>(`
        SELECT (SELECT count(*)::int FROM local_shipments WHERE order_id=$1) AS shipments,
          (SELECT count(*)::int FROM local_shipment_items si JOIN local_shipments s ON s.id=si.shipment_id WHERE s.order_id=$1) AS items
      `, [orderId])).rows[0];
    }

    async function vendor() {
      return (await db.query<{ id: string }>(
        "INSERT INTO vendors(name,slug) VALUES('Shipping supplier',gen_random_uuid()::text) RETURNING id",
      )).rows[0].id;
    }

    async function po(orderId: string, vendorId: string, status = 'sent') {
      return (await db.query<{ id: string }>(
        'INSERT INTO vendor_orders(order_id,vendor_id,status) VALUES($1,$2,$3::vendor_order_status) RETURNING id',
        [orderId, vendorId, status],
      )).rows[0].id;
    }

    await test('only paid orders can reserve or record manual shipments', async () => {
      for (const status of ['pending', 'payment_held', 'cancelled', 'refunded', 'partially_refunded']) {
        const f = await fixture([2], status);
        await assert.rejects(reserve(f), /Only paid/);
        await assert.rejects(manual(f, 1, `TRACK-${status}`), /Only paid/);
        assert.deepEqual(await counts(f.orderId), { shipments: 0, items: 0 });
      }
    });

    await test('duplicate items roll back the entire shipment', async () => {
      const f = await fixture([3]);
      await assert.rejects(mutate(f.orderId, 'reserve', { items: [...items(f.itemIds[0]), ...items(f.itemIds[0])] }), /duplicate key/);
      assert.deepEqual(await counts(f.orderId), { shipments: 0, items: 0 });
      assert.equal((await reserve(f, 3)).status, 'draft');
    });

    await test('missing, null, empty and malformed item lists cannot create empty shipments', async () => {
      const f = await fixture();
      for (const payload of [{}, { items: null }, { items: [] }, { items: {} }]) {
        await assert.rejects(mutate(f.orderId, 'reserve', payload));
        assert.deepEqual(await counts(f.orderId), { shipments: 0, items: 0 });
      }
    });

    await test('invalid quantities and foreign order items roll back earlier selections', async () => {
      const f = await fixture([3, 3]);
      const other = await fixture();
      await assert.rejects(mutate(f.orderId, 'reserve', { items: [...items(f.itemIds[0]), ...items(other.itemIds[0])] }), /does not belong/);
      for (const quantity of [0, -1, 1.5, '1', null]) {
        await assert.rejects(mutate(f.orderId, 'reserve', { items: [{ orderItemId: f.itemIds[0], quantity }] }));
      }
      assert.deepEqual(await counts(f.orderId), { shipments: 0, items: 0 });
    });

    await test('overlapping requests serialize without reserving more than ordered', async () => {
      const f = await fixture([3]);
      // PGlite serializes one connection. This exercises concurrent callers and
      // persisted balances, not a multi-connection PostgreSQL lock contention test.
      const results = await Promise.allSettled([reserve(f, 2), reserve(f, 2)]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      const rejected = results.find((r) => r.status === 'rejected');
      assert.ok(rejected?.status === 'rejected');
      assert.match(String(rejected.reason), /Quantity exceeds/);
      assert.deepEqual(await counts(f.orderId), { shipments: 1, items: 1 });
      await reserve(f, 1);
      await assert.rejects(reserve(f, 1), /Quantity exceeds/);
      const balance = await db.query<{ quantity: number }>('SELECT sum(quantity)::int AS quantity FROM local_shipment_items WHERE order_item_id=$1', [f.itemIds[0]]);
      assert.equal(balance.rows[0].quantity, 3);
    });

    await test('supplier POs and local reservations cannot overlap in either direction', async () => {
      const supplier = await vendor();
      const f = await fixture([2], 'paid', [supplier]);
      const poId = await po(f.orderId, supplier);
      await assert.rejects(reserve(f), /Resolve the supplier PO/);
      await assert.rejects(manual(f, 1, 'PO-TRACK'), /Resolve the supplier PO/);
      await db.query("UPDATE vendor_orders SET status='cancelled' WHERE id=$1", [poId]);
      const shipment = await reserve(f);
      await assert.rejects(po(f.orderId, supplier), /reserved for local shipping/);
      await assert.rejects(db.query("UPDATE vendor_orders SET status='sent' WHERE id=$1", [poId]), /reserved for local shipping/);
      await assert.rejects(db.query('UPDATE order_items SET assigned_vendor_id=NULL WHERE id=$1', [f.itemIds[0]]), /Cannot reassign/);
      await mutate(f.orderId, 'cancel', { shipmentId: shipment.id });
      await db.query("UPDATE vendor_orders SET status='sent' WHERE id=$1", [poId]);
    });

    await test('ambiguous vendor assignments block local shipping until explicitly resolved', async () => {
      const supplier = await vendor();
      const localVendor = await vendor();
      await db.query('UPDATE vendors SET is_self_fulfilled=true WHERE id=$1', [localVendor]);
      const f = await fixture([2]);
      await po(f.orderId, supplier);
      await assert.rejects(reserve(f), /supplier PO/);
      await assert.rejects(manual(f, 1, 'AMBIGUOUS-TRACK'), /supplier PO/);
      assert.deepEqual(await counts(f.orderId), { shipments: 0, items: 0 });
      await db.query('UPDATE order_items SET assigned_vendor_id=$1 WHERE id=$2', [localVendor, f.itemIds[0]]);
      assert.equal((await reserve(f)).status, 'draft');
    });

    await test('unassigned local reservations block creating or reactivating any supplier PO', async () => {
      const supplier = await vendor();
      const f = await fixture();
      const shipment = await reserve(f);
      await assert.rejects(po(f.orderId, supplier), /reserved for local shipping/);
      const cancelledPo = await po(f.orderId, supplier, 'cancelled');
      await assert.rejects(db.query("UPDATE vendor_orders SET status='sent' WHERE id=$1", [cancelledPo]), /reserved for local shipping/);
      await mutate(f.orderId, 'cancel', { shipmentId: shipment.id });
      await db.query("UPDATE vendor_orders SET status='sent' WHERE id=$1", [cancelledPo]);
    });

    await test('purchase claims only once and uses the saved rate price and carrier', async () => {
      const f = await fixture();
      const shipment = await quoted(f);
      await assert.rejects(mutate(f.orderId, 'claim_purchase', { shipmentId: shipment.id, rateId: 'tampered-rate' }), /Choose a rate quoted/);
      const claims = await Promise.all([
        mutate(f.orderId, 'claim_purchase', { shipmentId: shipment.id, rateId: 'quoted-rate', amount: 0.01, carrier: 'tampered' }),
        mutate(f.orderId, 'claim_purchase', { shipmentId: shipment.id, rateId: 'quoted-rate' }),
      ]);
      assert.equal(claims.filter((s) => s.claimed).length, 1);
      assert.ok(claims.every((s) => s.status === 'purchasing'));
      assert.equal(claims[0].carrier, 'USPS');
      assert.equal(claims[0].service, 'Ground Advantage');
      assert.equal(claims[0].postage, 8.45);
    });

    await test('missing or expired quotes and a newly unpaid order cannot purchase', async () => {
      const f = await fixture();
      const unquoted = await reserve(f);
      await assert.rejects(mutate(f.orderId, 'claim_purchase', { shipmentId: unquoted.id, rateId: 'quoted-rate' }), /Rates expired/);
      const shipment = await quoted(f);
      await db.query("UPDATE local_shipments SET quoted_at=now()-interval '21 minutes' WHERE id=$1", [shipment.id]);
      await assert.rejects(mutate(f.orderId, 'claim_purchase', { shipmentId: shipment.id, rateId: 'quoted-rate' }), /Rates expired/);
      await db.query('UPDATE local_shipments SET quoted_at=now() WHERE id=$1', [shipment.id]);
      await db.query("UPDATE orders SET status='refunded' WHERE id=$1", [f.orderId]);
      await assert.rejects(mutate(f.orderId, 'claim_purchase', { shipmentId: shipment.id, rateId: 'quoted-rate' }), /no longer paid/);
    });

    await test('uncertain purchases cannot cancel, repurchase, or free their reserved balance', async () => {
      const f = await fixture([1]);
      const shipment = await quoted(f);
      await mutate(f.orderId, 'claim_purchase', { shipmentId: shipment.id, rateId: 'quoted-rate' });
      assert.equal((await mutate(f.orderId, 'purchase_unknown', { shipmentId: shipment.id })).status, 'unknown');
      await assert.rejects(mutate(f.orderId, 'cancel', { shipmentId: shipment.id }), /Only unpurchased/);
      const claim = await mutate(f.orderId, 'claim_purchase', { shipmentId: shipment.id, rateId: 'quoted-rate' });
      assert.equal(claim.claimed, false);
      assert.equal(claim.status, 'unknown');
      await assert.rejects(reserve(f), /Quantity exceeds/);
      await assert.rejects(mutate(f.orderId, 'save_rates', { shipmentId: shipment.id, rates }), /no longer editable/);
    });

    await test('a label does not fulfill an order until marked shipped; recovery is supported', async () => {
      const f = await fixture([1]);
      const shipment = await quoted(f);
      await assert.rejects(mutate(f.orderId, 'mark_shipped', { shipmentId: shipment.id }), /purchased label/);
      await mutate(f.orderId, 'claim_purchase', { shipmentId: shipment.id, rateId: 'quoted-rate' });
      await mutate(f.orderId, 'purchase_unknown', { shipmentId: shipment.id });
      const label = await mutate(f.orderId, 'store_label', {
        shipmentId: shipment.id, label_id: `label-${shipment.id}`, tracking_number: `tracking-${shipment.id}`,
        label_download_url: 'https://example.invalid/label.pdf',
      });
      assert.equal(label.status, 'label_created');
      assert.equal(label.shipped_at, null);
      assert.equal(await fulfillment(f.orderId), 'unfulfilled');
      const shipped = await mutate(f.orderId, 'mark_shipped', { shipmentId: shipment.id });
      assert.equal(shipped.status, 'shipped');
      assert.ok(shipped.shipped_at);
      assert.equal(await fulfillment(f.orderId), 'shipped');
      assert.equal((await mutate(f.orderId, 'mark_shipped', { shipmentId: shipment.id })).shipped_at, shipped.shipped_at);
    });

    await test('manual partial shipments and remaining items produce accurate fulfillment', async () => {
      const f = await fixture([3, 1]);
      await manual(f, 1, 'MANUAL-FIRST');
      assert.equal(await fulfillment(f.orderId), 'partially_shipped');
      await assert.rejects(manual(f, 1, 'MANUAL-FIRST'), /already recorded/);
      await manual(f, 2, 'MANUAL-SECOND');
      assert.equal(await fulfillment(f.orderId), 'partially_shipped');
      await manual(f, 1, 'MANUAL-THIRD', 1);
      assert.equal(await fulfillment(f.orderId), 'shipped');
      await assert.rejects(reserve(f), /Only paid, unshipped/);
    });

    await test('supplier completion leaves outstanding local items partially shipped', async () => {
      const supplier = await vendor();
      const localVendor = await vendor();
      await db.query('UPDATE vendors SET is_self_fulfilled=true WHERE id=$1', [localVendor]);
      const f = await fixture([2, 2], 'paid', [supplier, localVendor]);
      const poId = await po(f.orderId, supplier);
      await reserve(f, 1, 1);
      await db.query('SELECT shipping_mark_vendor_shipped($1)', [poId]);
      assert.equal(await fulfillment(f.orderId), 'partially_shipped');
      await manual(f, 1, 'MIXED-LOCAL', 1);
      assert.equal(await fulfillment(f.orderId), 'partially_shipped');
      const draft = (await db.query<{ id: string }>("SELECT id FROM local_shipments WHERE order_id=$1 AND status='draft'", [f.orderId])).rows[0];
      await mutate(f.orderId, 'cancel', { shipmentId: draft.id });
      await manual(f, 1, 'MIXED-REMAINDER', 1);
      assert.equal(await fulfillment(f.orderId), 'shipped');
    });

    await test('legacy whole-order shipping requires payment and valid tracking, and is idempotent', async () => {
      const unpaid = await fixture([1], 'pending');
      await assert.rejects(legacyManual(unpaid.orderId, 'LEGACY-PENDING'), /must be paid/);
      assert.equal(await fulfillment(unpaid.orderId), 'unfulfilled');
      const f = await fixture([2]);
      await assert.rejects(legacyManual(f.orderId, ''), /Valid tracking/);
      await assert.rejects(legacyManual('00000000-0000-0000-0000-000000000000', 'MISSING-ORDER'), /Order not found/);
      assert.equal(await legacyManual(f.orderId, 'LEGACY-FIRST'), true);
      const original = (await db.query<{ tracking_number: string; shipped_at: Date; admin_notes: string }>('SELECT tracking_number,shipped_at,admin_notes FROM orders WHERE id=$1', [f.orderId])).rows[0];
      assert.equal(original.tracking_number, 'LEGACY-FIRST');
      assert.ok(original.shipped_at);
      assert.equal(await fulfillment(f.orderId), 'shipped');
      assert.equal(await legacyManual(f.orderId, 'LEGACY-SECOND'), false);
      assert.deepEqual((await db.query('SELECT tracking_number,shipped_at,admin_notes FROM orders WHERE id=$1', [f.orderId])).rows[0], original);
      await assert.rejects(reserve(f), /Only paid, unshipped/);
    });

    await test('legacy whole-order shipping cannot bypass active local or supplier shipments', async () => {
      const local = await fixture([2]);
      const draft = await reserve(local);
      await assert.rejects(legacyManual(local.orderId, 'LEGACY-LOCAL'), /shipment or supplier controls/);
      assert.equal(await fulfillment(local.orderId), 'unfulfilled');
      await mutate(local.orderId, 'cancel', { shipmentId: draft.id });
      assert.equal(await legacyManual(local.orderId, 'LEGACY-AFTER-CANCEL'), true);

      const partial = await fixture([2]);
      await manual(partial, 1, 'LOCAL-PARTIAL');
      await assert.rejects(legacyManual(partial.orderId, 'LEGACY-PARTIAL'), /shipment or supplier controls/);
      assert.equal(await fulfillment(partial.orderId), 'partially_shipped');

      const supplier = await vendor();
      const supplied = await fixture([1], 'paid', [supplier]);
      const poId = await po(supplied.orderId, supplier);
      await assert.rejects(legacyManual(supplied.orderId, 'LEGACY-SUPPLIER'), /shipment or supplier controls/);
      await db.query("UPDATE vendor_orders SET status='cancelled' WHERE id=$1", [poId]);
      assert.equal(await legacyManual(supplied.orderId, 'LEGACY-CANCELLED-PO'), true);
    });

    await test('supplier shipping rejects unpaid orders and cancelled POs', async () => {
      const supplier = await vendor();
      const unpaid = await fixture([1], 'pending', [supplier]);
      const unpaidPo = await po(unpaid.orderId, supplier);
      await assert.rejects(db.query('SELECT shipping_mark_vendor_shipped($1)', [unpaidPo]), /must be paid/);
      const paid = await fixture([1], 'paid', [supplier]);
      const cancelledPo = await po(paid.orderId, supplier, 'cancelled');
      await assert.rejects(db.query('SELECT shipping_mark_vendor_shipped($1)', [cancelledPo]), /Cancelled PO/);
      assert.equal(await fulfillment(paid.orderId), 'unfulfilled');
    });

    await test('failed drafts retain quantity until cancellation; cancellation releases it', async () => {
      const f = await fixture([1]);
      const shipment = await reserve(f);
      assert.equal((await mutate(f.orderId, 'rate_failed', { shipmentId: shipment.id })).status, 'failed');
      await assert.rejects(reserve(f), /Quantity exceeds/);
      await mutate(f.orderId, 'cancel', { shipmentId: shipment.id });
      assert.equal((await reserve(f)).status, 'draft');
    });

    await test('notification claiming is exclusive and does not retry beyond the safe window', async () => {
      const f = await fixture([1]);
      const shipment = await manual(f, 1, 'NOTIFY-TRACK');
      const claim = () => mutate(f.orderId, 'claim_notification', { shipmentId: shipment.id });
      const results = await Promise.all([claim(), claim()]);
      assert.equal(results.filter((s) => s.claimed).length, 1);
      await mutate(f.orderId, 'finish_notification', { shipmentId: shipment.id, ok: false });
      assert.equal((await claim()).claimed, true);
      await mutate(f.orderId, 'finish_notification', { shipmentId: shipment.id, ok: true });
      assert.equal((await claim()).claimed, false);
      await db.query("UPDATE local_shipments SET notification_state='failed',notification_attempt_at=now()-interval '24 hours' WHERE id=$1", [shipment.id]);
      assert.equal((await claim()).claimed, false);
    });

    await test('notification claims expire after two minutes without resetting the retry window', async () => {
      const f = await fixture([2]);
      const draft = await reserve(f);
      assert.equal((await mutate(f.orderId, 'claim_notification', { shipmentId: draft.id })).claimed, false);
      const shipment = await manual(f, 1, 'NOTIFY-LEASE');
      const claim = () => mutate(f.orderId, 'claim_notification', { shipmentId: shipment.id });
      assert.equal((await claim()).claimed, true);
      await db.query("UPDATE local_shipments SET notification_attempt_at=now()-interval '1 hour',notification_claimed_at=now()-interval '1 minute' WHERE id=$1", [shipment.id]);
      assert.equal((await claim()).claimed, false);
      await db.query("UPDATE local_shipments SET notification_claimed_at=now()-interval '3 minutes' WHERE id=$1", [shipment.id]);
      const originalAttempt = (await db.query('SELECT notification_attempt_at FROM local_shipments WHERE id=$1', [shipment.id])).rows[0];
      const claims = await Promise.all([claim(), claim()]);
      assert.equal(claims.filter(s => s.claimed).length, 1);
      assert.deepEqual((await db.query('SELECT notification_attempt_at FROM local_shipments WHERE id=$1', [shipment.id])).rows[0], originalAttempt);
      await db.query("UPDATE local_shipments SET notification_attempt_at=now()-interval '24 hours',notification_claimed_at=now()-interval '3 minutes' WHERE id=$1", [shipment.id]);
      assert.equal((await claim()).claimed, false);
    });

    await test('shipment IDs cannot be used with another order', async () => {
      const f = await fixture();
      const other = await fixture();
      const shipment = await reserve(f);
      await assert.rejects(mutate(other.orderId, 'cancel', { shipmentId: shipment.id }), /Shipment not found/);
      assert.equal((await db.query<{ status: string }>('SELECT status FROM local_shipments WHERE id=$1', [shipment.id])).rows[0].status, 'draft');
    });

    await test('RLS is enabled and shipment tables and RPCs are accessible only to service_role', async () => {
      const tables = ['local_shipments', 'local_shipment_items'];
      const functions = [
        'public.shipping_mutate(uuid,text,jsonb)',
        'public.shipping_refresh_fulfillment(uuid)',
        'public.shipping_mark_vendor_shipped(uuid)',
        'public.shipping_mark_order_manual(uuid,text)',
        'public.shipping_guard_vendor_assignment()',
      ];
      for (const table of tables) {
        assert.equal((await db.query<{ enabled: boolean }>('SELECT relrowsecurity AS enabled FROM pg_class WHERE oid=$1::regclass', [`public.${table}`])).rows[0].enabled, true);
        for (const role of ['anon', 'authenticated', 'service_role']) {
          for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
            assert.equal((await db.query<{ allowed: boolean }>('SELECT has_table_privilege($1,$2,$3) AS allowed', [role, `public.${table}`, privilege])).rows[0].allowed, role === 'service_role', `${role} ${privilege} ${table}`);
          }
        }
      }
      for (const fn of functions) {
        for (const role of ['anon', 'authenticated', 'service_role']) {
          assert.equal((await db.query<{ allowed: boolean }>("SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed", [role, fn])).rows[0].allowed, role === 'service_role', `${role} EXECUTE ${fn}`);
        }
        assert.equal((await db.query<{ definer: boolean }>('SELECT prosecdef AS definer FROM pg_proc WHERE oid=$1::regprocedure', [fn])).rows[0].definer, false);
      }
      const f = await fixture();
      for (const role of ['anon', 'authenticated']) {
        await db.exec(`RESET ROLE; SET ROLE ${role}`);
        try {
          for (const table of tables) {
            await assert.rejects(db.query(`SELECT * FROM public.${table}`), /permission denied/);
            await assert.rejects(db.query(`DELETE FROM public.${table}`), /permission denied/);
          }
          await assert.rejects(reserve(f), /permission denied for function shipping_mutate/);
          await assert.rejects(db.query('SELECT shipping_refresh_fulfillment($1)', [f.orderId]), /permission denied/);
          await assert.rejects(db.query('SELECT shipping_mark_vendor_shipped($1)', [f.orderId]), /permission denied/);
          await assert.rejects(legacyManual(f.orderId, 'DENIED-LEGACY'), /permission denied/);
        } finally {
          await db.exec('RESET ROLE; SET ROLE service_role');
        }
      }
      assert.equal((await reserve(f)).status, 'draft');
    });
  } finally {
    await db.close();
  }
  console.log(`${passed} shipping database checks passed; ${failures.length} failed.`);
  if (failures.length) throw new Error(`Failed checks: ${failures.join('; ')}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
