import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

type Count = { on_hand: number; reserved: number; available: number; stock_status: string };

async function main() {
  const db = new PGlite();
  const vendor = randomUUID();
  let fixtures = 0;
  try {
    await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE DOMAIN citext AS text;`);
    for (const name of ['0001_initial_schema.sql', '0004_add_cart_hash.sql', '0005_payment_audit_log.sql', '20260916211425_wallet_checkout.sql']) {
      await db.exec((await readFile(`supabase/migrations/${name}`, 'utf8')).replace('CREATE EXTENSION IF NOT EXISTS citext;', ''));
    }
    await db.exec('GRANT USAGE ON SCHEMA public TO service_role,anon,authenticated; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;');
    await db.query('INSERT INTO vendors(id,name,slug,is_self_fulfilled) VALUES($1,$2,$3,true)', [vendor, 'Test warehouse', 'test-warehouse']);
    const newProduct = async (configured = true, status = 'in_stock') => {
      const id = randomUUID(); const sku = `INV-${++fixtures}`;
      await db.query('INSERT INTO products(id,sku,name,slug,retail_price,stock_status,weight_lb,preferred_vendor_id) VALUES($1,$2,$2,$2,18,$3,$4,$5)', [id, sku, status, configured ? 1.2 : null, configured ? vendor : null]);
      return id;
    };
    const untracked = await newProduct(false);
    const before = (await db.query('SELECT * FROM products ORDER BY id')).rows;
    await db.exec(await readFile('supabase/migrations/20261027221701_product_inventory.sql', 'utf8'));
    assert.deepEqual((await db.query('SELECT * FROM products ORDER BY id')).rows, before);
    assert.equal((await db.query('SELECT * FROM product_inventory')).rows.length, 0);
    console.log('PASS: migration preserves existing products and leaves inventory opt-in');
    await db.exec('SET ROLE service_role');
    const count = async (id: string) => (await db.query<Count>(`SELECT i.on_hand,i.reserved,i.on_hand-i.reserved AS available,p.stock_status
      FROM product_inventory i JOIN products p ON p.id=i.product_id WHERE i.product_id=$1`, [id])).rows[0];
    const adjust = async (id: string, action: string, quantity: number | null, reason = 'Counted physical stock', requestId = randomUUID()) =>
      (await db.query<{ result: Count }>('SELECT inventory_adjust($1,$2,$3,$4,$5) AS result', [id, action, quantity, reason, requestId])).rows[0].result;
    const order = async (status = 'pending') => (await db.query<{ id: string }>(`INSERT INTO orders(customer_email,status,subtotal,total,shipping_address,billing_address)
      VALUES('inventory-test@example.invalid',$1,18,18,'{}','{}') RETURNING id`, [status])).rows[0].id;
    const addItems = async (orderId: string, items: Array<[string, number]>) => (await db.query<{ id: string }>(`INSERT INTO order_items(order_id,product_id,product_sku,product_name,quantity,unit_price,line_subtotal)
      SELECT $1::uuid,p.id,p.sku,p.name,j.quantity,18,18*j.quantity FROM jsonb_to_recordset($2::jsonb) AS j(product_id uuid,quantity integer)
      JOIN products p ON p.id=j.product_id RETURNING id`, [orderId, JSON.stringify(items.map(([product_id, quantity]) => ({ product_id, quantity })))] )).rows.map(row => row.id);
    const status = (id: string, next: string) => db.query('UPDATE orders SET status=$2 WHERE id=$1', [id, next]);
    const moves = async (id: string, action?: string) => (await db.query<{ n: number }>('SELECT count(*)::integer n FROM inventory_movements WHERE product_id=$1 AND ($2::text IS NULL OR action=$2)', [id, action ?? null])).rows[0].n;

    const p = await newProduct();
    const requestId = randomUUID();
    const opening = await adjust(p, 'start', 10, 'Initial count', requestId);
    assert.deepEqual({ on_hand: opening.on_hand, reserved: opening.reserved, available: opening.available, stock_status: opening.stock_status }, { on_hand: 10, reserved: 0, available: 10, stock_status: 'in_stock' });
    await adjust(p, 'start', 10, 'Initial count', requestId);
    assert.equal(await moves(p, 'start'), 1);
    for (const [id, action, qty, reason] of [[p, 'add', 10, 'Initial count'], [p, 'start', 9, 'Initial count'], [p, 'start', 10, 'Different reason']] as const) {
      await assert.rejects(adjust(id, action, qty, reason, requestId), /request ID already used/);
    }
    await assert.rejects(adjust(p, 'start', 10), /already enabled/);
    await assert.rejects(adjust(untracked, 'add', 2), /opening count first/);
    await assert.rejects(adjust(randomUUID(), 'start', 1), /Product not found/);
    for (const [action, qty, reason] of [['add', 0, 'reason'], ['remove', -1, 'reason'], ['start', null, 'reason'], ['unknown', 1, 'reason'], ['add', 1, ' '], ['add', 1, 'x'.repeat(501)]] as const) {
      await assert.rejects(adjust(p, action, qty, reason), /valid stock quantity/);
    }
    const addId = randomUUID();
    await adjust(p, 'add', 2, 'Delivery', addId); await adjust(p, 'add', 2, 'Delivery', addId);
    await adjust(p, 'remove', 2, 'Damaged units');
    assert.equal((await count(p)).on_hand, 10);
    assert.equal(await moves(p, 'add'), 1);
    console.log('PASS: opening counts, add/remove, input checks and conflicting or repeated request IDs');

    const first = await order();
    const [firstItem] = await addItems(first, [[p, 3]]);
    assert.deepEqual(await count(p), { on_hand: 10, reserved: 3, available: 7, stock_status: 'in_stock' });
    await assert.rejects(adjust(p, 'remove', 8), /reserved for pending orders/);
    const second = await order();
    const itemCount = (await db.query('SELECT id FROM order_items')).rows.length;
    await assert.rejects(addItems(second, [[p, 4], [p, 4]]), /Insufficient inventory/);
    assert.equal((await db.query('SELECT id FROM order_items')).rows.length, itemCount);
    assert.equal((await count(p)).reserved, 3);
    assert.equal(await moves(p, 'reserve'), 1);
    const empty = await newProduct(); await adjust(empty, 'start', 0);
    await assert.rejects(addItems(second, [[p, 1], [empty, 1]]), /Inventory unavailable/);
    assert.equal((await count(p)).reserved, 3);
    await status(first, 'paid'); await status(first, 'paid');
    assert.deepEqual(await count(p), { on_hand: 7, reserved: 0, available: 7, stock_status: 'in_stock' });
    assert.equal(await moves(p, 'commit'), 1);
    await status(first, 'refunded');
    assert.equal((await count(p)).on_hand, 7);
    await assert.rejects(db.query('DELETE FROM order_items WHERE id=$1', [firstItem]), /committed inventory/);
    await assert.rejects(db.query('DELETE FROM orders WHERE id=$1', [first]), /committed inventory/);
    console.log('PASS: duplicate SKU quantities, oversell rejection, cart rollback and exactly-once payment deductions');

    const held = await order(); await addItems(held, [[p, 2]]); await status(held, 'payment_held'); await status(held, 'paid');
    assert.deepEqual(await count(p), { on_hand: 5, reserved: 0, available: 5, stock_status: 'low_stock' });
    await status(held, 'cancelled');
    assert.equal((await count(p)).on_hand, 5, 'committed cancellations require manual restocking');
    const manual = await order('paid'); await addItems(manual, [[p, 1]]);
    assert.equal((await count(p)).on_hand, 4, 'direct-paid manual order deducts on item insertion');
    const pending = await order(); const [pendingItem] = await addItems(pending, [[p, 2]]);
    await status(pending, 'cancelled'); await status(pending, 'cancelled');
    assert.equal((await count(p)).reserved, 0);
    assert.equal(await moves(p, 'release'), 1);
    await assert.rejects(status(pending, 'paid'), /inventory was released/);
    await assert.rejects(status(pending, 'pending'), /Cannot reopen/);
    await assert.rejects(db.query('UPDATE order_items SET quantity=3 WHERE id=$1', [pendingItem]), /Cannot change/);
    await db.query('UPDATE order_items SET assigned_vendor_id=$2 WHERE id=$1', [pendingItem, vendor]);
    const pendingDelete = await order(); const [deleteItem] = await addItems(pendingDelete, [[p, 1]]);
    await db.query('DELETE FROM order_items WHERE id=$1', [deleteItem]);
    assert.equal((await count(p)).reserved, 0);
    const cascade = await order(); await addItems(cascade, [[p, 1]]); await db.query('DELETE FROM orders WHERE id=$1', [cascade]);
    assert.equal((await count(p)).reserved, 0);
    assert.equal(await moves(p, 'release'), 3);
    console.log('PASS: held/manual orders, cancellations, pending-item deletion and historical audit retention');

    const last = await newProduct(); await adjust(last, 'start', 1);
    const lastOrders = await Promise.all([order(), order()]);
    // PGlite serializes its connection; these contenders exercise the locked SQL decisions,
    // while actual multi-session blocking is a separate PostgreSQL integration concern.
    const contenders = await Promise.allSettled(lastOrders.map(id => addItems(id, [[last, 1]])));
    assert.equal(contenders.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(contenders.filter(r => r.status === 'rejected').length, 1);
    assert.deepEqual(await count(last), { on_hand: 1, reserved: 1, available: 0, stock_status: 'low_stock' });
    const winningOrder = lastOrders[contenders.findIndex(r => r.status === 'fulfilled')];
    await status(winningOrder, 'paid');
    assert.deepEqual(await count(last), { on_hand: 0, reserved: 0, available: 0, stock_status: 'out_of_stock' });
    await assert.rejects(db.query("UPDATE products SET stock_status='in_stock' WHERE id=$1", [last]), /Add stock before/);
    await adjust(last, 'add', 3);
    assert.equal((await count(last)).stock_status, 'low_stock');
    await db.query("UPDATE products SET stock_status='out_of_stock' WHERE id=$1", [p]);
    await adjust(p, 'remove', 1);
    assert.equal((await count(p)).stock_status, 'out_of_stock', 'manual pause is preserved by removal');
    const unavailable = await newProduct(false, 'out_of_stock'); await adjust(unavailable, 'start', 3); await adjust(unavailable, 'add', 1);
    assert.equal((await count(unavailable)).stock_status, 'out_of_stock');
    await assert.rejects(db.query("UPDATE products SET stock_status='in_stock' WHERE id=$1", [unavailable]), /shipping weight and fulfillment vendor/);
    await db.query('UPDATE products SET weight_lb=1.1,preferred_vendor_id=$2 WHERE id=$1', [unavailable, vendor]);
    assert.equal((await count(unavailable)).stock_status, 'out_of_stock', 'fulfillment edits do not silently enable sales');
    await db.query("UPDATE products SET stock_status='in_stock' WHERE id=$1", [unavailable]);
    const discontinued = await newProduct(true, 'discontinued'); await adjust(discontinued, 'start', 4); await adjust(discontinued, 'add', 1);
    assert.equal((await count(discontinued)).stock_status, 'discontinued');
    console.log('PASS: last-unit contention, sold-out state, manual pause and incomplete-fulfillment guards');

    for (const existingStatus of ['pending', 'payment_held', 'paid']) {
      const existing = await newProduct(); const existingOrder = await order(existingStatus); await addItems(existingOrder, [[existing, 3]]);
      if (existingStatus === 'paid') {
        await adjust(existing, 'start', 8);
        assert.equal((await count(existing)).on_hand, 8, 'opening count excludes historical paid inventory');
      } else {
        await assert.rejects(adjust(existing, 'start', 8), /Resolve existing pending/);
        await status(existingOrder, 'cancelled'); await adjust(existing, 'start', 8);
      }
    }
    const legacyOrder = await order(); const [legacyItem] = await addItems(legacyOrder, [[untracked, 2]]);
    await assert.rejects(db.query('UPDATE order_items SET product_id=$2 WHERE id=$1', [legacyItem, last]), /Create a new order item/);
    await status(legacyOrder, 'paid');
    assert.equal((await db.query('SELECT * FROM product_inventory WHERE product_id=$1', [untracked])).rows.length, 0);
    console.log('PASS: safe opt-in with legacy orders, unchanged untracked catalog and item-edit bypass protection');

    const walletProduct = await newProduct(); await adjust(walletProduct, 'start', 2);
    const walletId = randomUUID();
    const walletOrder = { customer_email: 'wallet-inventory@example.invalid', subtotal: 36, shipping_cost: 0, tax: 0, total: 36,
      shipping_address: {}, billing_address: {}, business_name: null, is_business: false, client_ip: 'test' };
    const walletItems = [{ product_id: walletProduct, product_sku: 'WALLET', product_name: 'Wallet inventory', quantity: 2,
      unit_price: 18, line_subtotal: 36, unit_wholesale_cost: null, assigned_vendor_id: vendor }];
    const prepare = () => db.query<{ result: { order_id: string } }>('SELECT prepare_wallet_checkout($1,$2,$3,$4,$5,$6) result', [walletId, 'inventory-wallet', 'paypal', 'live', walletOrder, walletItems]);
    const attempt = (await prepare()).rows[0].result; await prepare();
    assert.deepEqual(await count(walletProduct), { on_hand: 2, reserved: 2, available: 0, stock_status: 'low_stock' });
    await db.query('UPDATE wallet_checkout_attempts SET provider_order_id=$2 WHERE id=$1', [walletId, 'TEST-PROVIDER-ORDER']);
    await db.query('SELECT finalize_wallet_checkout($1,$2,$3,$4)', [walletId, 'TEST-CAPTURE', 36, 'USD']);
    await db.query('SELECT finalize_wallet_checkout($1,$2,$3,$4)', [walletId, 'TEST-CAPTURE', 36, 'USD']);
    assert.deepEqual(await count(walletProduct), { on_hand: 0, reserved: 0, available: 0, stock_status: 'out_of_stock' });
    assert.equal(await moves(walletProduct, 'commit'), 1);
    assert.equal((await db.query('SELECT id FROM payments WHERE order_id=$1', [attempt.order_id])).rows.length, 1);
    console.log('PASS: actual wallet prepare/finalize RPCs reserve, reuse and deduct exactly once');

    const sandboxId = randomUUID();
    const inventoryBeforeSandbox = await count(walletProduct);
    const sandboxMovesBefore = await moves(walletProduct);
    await db.query('SELECT prepare_wallet_checkout($1,$2,$3,$4,$5,$6)', [sandboxId, 'inventory-sandbox', 'paypal', 'sandbox', walletOrder, walletItems]);
    await db.query('UPDATE wallet_checkout_attempts SET provider_order_id=$2 WHERE id=$1', [sandboxId, 'TEST-SANDBOX-ORDER']);
    await db.query('SELECT finalize_wallet_checkout($1,$2,$3,$4)', [sandboxId, 'TEST-SANDBOX-CAPTURE', 36, 'USD']);
    assert.deepEqual(await count(walletProduct), inventoryBeforeSandbox);
    assert.equal(await moves(walletProduct), sandboxMovesBefore);
    const sandboxUntracked = await newProduct();
    await db.query('SELECT prepare_wallet_checkout($1,$2,$3,$4,$5,$6)', [randomUUID(), 'sandbox-opening', 'paypal', 'sandbox', walletOrder, [{ ...walletItems[0], product_id: sandboxUntracked }]]);
    await adjust(sandboxUntracked, 'start', 9);
    assert.equal((await count(sandboxUntracked)).on_hand, 9);
    console.log('PASS: sandbox wallet checkouts neither reserve/deduct real stock nor block starting tracking');

    const permissions = (await db.query<{ public_read: boolean; public_adjust: boolean; user_adjust: boolean; ledger_update: boolean; ledger_delete: boolean; invoker: boolean; rls: boolean }>(`SELECT
      has_table_privilege('anon','product_inventory','SELECT') public_read,
      has_function_privilege('anon','inventory_adjust(uuid,text,integer,text,uuid)','EXECUTE') public_adjust,
      has_function_privilege('authenticated','inventory_adjust(uuid,text,integer,text,uuid)','EXECUTE') user_adjust,
      has_table_privilege('service_role','inventory_movements','UPDATE') ledger_update,
      has_table_privilege('service_role','inventory_movements','DELETE') ledger_delete,
      NOT EXISTS(SELECT 1 FROM pg_proc WHERE proname LIKE 'inventory_%' AND prosecdef) invoker,
      (SELECT bool_and(relrowsecurity) FROM pg_class WHERE relname IN ('product_inventory','inventory_order_allocations','inventory_movements')) rls`)).rows[0];
    assert.deepEqual(permissions, { public_read: false, public_adjust: false, user_adjust: false, ledger_update: false, ledger_delete: false, invoker: true, rls: true });
    await assert.rejects(db.query("UPDATE inventory_movements SET reason='overwritten' WHERE product_id=$1", [p]), /permission denied/);
    await assert.rejects(db.query('DELETE FROM inventory_movements WHERE product_id=$1', [p]), /permission denied/);
    console.log('PASS: private inventory tables, invoker functions, service-only adjustments and append-only movement grants');
    console.log('All inventory database checks passed. No external services or production data used.');
  } finally { await db.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
