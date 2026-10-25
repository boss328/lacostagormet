import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import ts from 'typescript';
import * as verification from '../src/lib/wallets/verification';
import { safeJson } from '../src/lib/authnet/safe-json';

type Row = Record<string, any>;
const localId = '11111111-1111-4111-8111-111111111111';
const supplierId = '22222222-2222-4222-8222-222222222222';

async function evaluate(file: string, modules: Record<string, unknown>): Promise<Row> {
  const compiled = ts.transpileModule(await readFile(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'process', compiled)((name: string) => {
    if (!(name in modules)) throw new Error(`Unmocked lifecycle boundary: ${name}`);
    return modules[name];
  }, module, module.exports, { env: { PAYPAL_MERCHANT_ID: 'fixture-merchant' } });
  return module.exports;
}

async function main() {
  const db = new PGlite();
  let sequence = 0;
  let passed = 0;
  const state = { failTable: '', omitVendor: '', providerAttempt: null as verification.WalletAttempt | null, notifications: 0 };
  const identifier = (name: string) => {
    assert.match(name, /^[a-z_]+$/);
    return `"${name}"`;
  };
  // Real application query chains execute against actual PostgreSQL migrations.
  // Only payment-provider reads and customer notification delivery are mocked.
  const client = {
    from(table: string) {
      identifier(table);
      let operation = 'select';
      let values: Row = {};
      const filters: Array<{ key: string; values: unknown[]; kind: 'eq' | 'in' | 'null' }> = [];
      let single = false;
      let limit: number | null = null;
      let columns = '*';
      const query = {
        select(value = '*') { columns = value; return query; },
        eq(key: string, value: unknown) { filters.push({ key, values: [value], kind: 'eq' }); return query; },
        is(key: string, value: unknown) { assert.equal(value, null); filters.push({ key, values: [], kind: 'null' }); return query; },
        in(key: string, value: unknown[]) { filters.push({ key, values: value, kind: 'in' }); return query; },
        limit(value: number) { limit = value; return query; },
        maybeSingle() { single = true; return query; },
        update(value: Row) { operation = 'update'; values = value; return query; },
        insert(value: Row) { operation = 'insert'; values = value; return query; },
        then(resolve: (result: unknown) => unknown, reject?: (error: unknown) => unknown) {
          return execute().then(resolve, reject);
        },
      };
      async function execute() {
        if (state.failTable === table) return { data: null, error: { code: 'XX000', message: 'Synthetic unavailable table' } };
        const args: unknown[] = [];
        const param = (value: unknown) => { args.push(value !== null && typeof value === 'object' ? JSON.stringify(value) : value); return `$${args.length}`; };
        const names = Object.keys(values);
        let sql = operation === 'insert'
          ? `INSERT INTO public.${identifier(table)} (${names.map(identifier).join(',')}) VALUES (${names.map(key => param(values[key])).join(',')}) RETURNING *`
          : operation === 'update'
            ? `UPDATE public.${identifier(table)} AS t SET ${names.map(key => `${identifier(key)}=${param(values[key])}`).join(',')}`
            : `SELECT t.*${table === 'order_items' && columns.includes('products(') ? ',(SELECT jsonb_build_object(\'preferred_vendor_id\',p.preferred_vendor_id) FROM public.products p WHERE p.id=t.product_id) AS products' : ''} FROM public.${identifier(table)} AS t`;
        if (operation !== 'insert') {
          const predicates = filters.map(filter => {
            const field = `t.${identifier(filter.key)}`;
            if (filter.kind === 'null') return `${field} IS NULL`;
            if (filter.kind === 'in') return filter.values.length ? `${field} IN (${filter.values.map(param).join(',')})` : 'false';
            return `${field}=${param(filter.values[0])}`;
          });
          if (predicates.length) sql += ` WHERE ${predicates.join(' AND ')}`;
          if (operation === 'update') sql += ' RETURNING t.*';
          else if (limit !== null) sql += ` LIMIT ${limit}`;
        }
        try {
          let rows = (await db.query<Row>(sql, args)).rows;
          if (table === 'vendors' && state.omitVendor) rows = rows.filter(row => row.id !== state.omitVendor);
          return { data: single ? rows[0] ?? null : rows, error: null };
        } catch (error) {
          return { data: null, error };
        }
      }
      return query;
    },
    async rpc(name: string, args: Row) {
      assert.equal(name, 'finalize_wallet_checkout');
      try {
        const result = await db.query<{ result: string }>('SELECT public.finalize_wallet_checkout($1,$2,$3,$4) AS result', [args.p_attempt_id, args.p_transaction_id, args.p_amount, args.p_currency]);
        return { data: result.rows[0].result, error: null };
      } catch (error) { return { data: null, error }; }
    },
  };
  try {
    await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE DOMAIN citext AS text; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
    await db.exec((await readFile('supabase/migrations/0001_initial_schema.sql', 'utf8')).replace('CREATE EXTENSION IF NOT EXISTS citext;', ''));
    for (const file of ['0004_add_cart_hash.sql', '0005_payment_audit_log.sql', '0006_vendor_warehouses_and_po.sql', '20260916211425_wallet_checkout.sql', '20261015023211_local_shipping.sql', '20261015074104_shipping_state_idempotency.sql', '20261015230709_supplier_po_send_claim.sql']) {
      await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
    }
    await db.exec(`
      GRANT USAGE ON SCHEMA public TO service_role;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
      INSERT INTO vendors(id,name,slug,is_self_fulfilled) VALUES('${localId}','Local stock','local-stock',true),('${supplierId}','Supplier','supplier',false);
      SET ROLE service_role;
    `);
    const common = { 'server-only': {}, '@/lib/supabase/admin': { createAdminClient: () => client } };
    const vendorPo = await evaluate('src/lib/admin/vendor-po.ts', common);
    const notify = { notifyOrderPlaced: async () => { state.notifications++; } };
    const card = await evaluate('src/lib/checkout/finalize-payment.ts', {
      ...common, '@/lib/admin/vendor-po': vendorPo, '@/lib/email/notify-order-placed': notify,
      '@/lib/authnet/safe-json': { safeJson },
    });
    const wallet = await evaluate('src/lib/wallets/finalize.ts', {
      ...common, '@/lib/admin/vendor-po': vendorPo, '@/lib/email/notify-order-placed': notify,
      './config': { walletConfig: () => ({ environment: 'live' }) }, './verification': verification,
      './paypal': { getPayPalOrder: async () => {
        const attempt = state.providerAttempt!;
        return { id: attempt.provider_order_id, status: 'COMPLETED', purchase_units: [{
          custom_id: attempt.id, invoice_id: attempt.order_number, payee: { merchant_id: 'fixture-merchant' },
          amount: { value: String(attempt.total), currency_code: 'USD' },
          payments: { captures: [{ id: `capture-${attempt.id}`, status: 'COMPLETED', final_capture: true, amount: { value: String(attempt.total), currency_code: 'USD' } }] },
        }] };
      }, capturePayPalOrder: async () => { throw new Error('No live captures in tests'); } },
      './amazon': {},
    });

    async function fixture(mixed = false, fallback = false) {
      const serial = ++sequence;
      const total = mixed ? 40 : 20;
      const order = (await db.query<Row>(`INSERT INTO orders(customer_email,subtotal,total,shipping_address,billing_address) VALUES('fixture@example.invalid',$1,$1,'{}','{}') RETURNING *`, [total])).rows[0];
      const itemIds: string[] = [];
      for (const vendor of mixed ? [localId, supplierId] : [localId]) {
        const sku = `FIXTURE-${serial}-${vendor === localId ? 'SINGLE' : 'CASE'}`;
        const product = (await db.query<Row>('INSERT INTO products(sku,name,slug,retail_price,preferred_vendor_id) VALUES($1,$1,$1,20,$2) RETURNING id', [sku, vendor])).rows[0];
        const item = (await db.query<Row>('INSERT INTO order_items(order_id,product_id,product_sku,product_name,quantity,unit_price,line_subtotal,assigned_vendor_id) VALUES($1,$2,$3,$3,2,10,20,$4) RETURNING id', [order.id, product.id, sku, fallback ? null : vendor])).rows[0];
        itemIds.push(item.id);
      }
      return { order, itemIds };
    }
    async function approveCard(order: Row) {
      return card.finalizeOrderPayment({ admin: client, order, source: 'fixture', tx: {
        transId: `card-${order.id}`, refId: order.order_number, amount: Number(order.total), responseCode: '1', raw: {},
      } });
    }
    async function approveWallet(order: Row) {
      const attempt = (await db.query<verification.WalletAttempt>(`INSERT INTO wallet_checkout_attempts(id,order_id,order_number,fingerprint,method,environment,total,provider_order_id)
        VALUES(gen_random_uuid(),$1,$2,'fixture','paypal','live',$3,$4) RETURNING *`, [order.id, order.order_number, order.total, `provider-${order.id}`])).rows[0];
      state.providerAttempt = attempt;
      await wallet.reconcileWalletPayment(attempt);
      return attempt;
    }
    async function mutate(orderId: string, action: string, itemId: string) {
      return (await db.query<Row>('SELECT public.shipping_mutate($1,$2,$3::jsonb) AS shipment', [orderId, action, JSON.stringify({
        items: [{ orderItemId: itemId, quantity: 1 }], parcel: { weight: 16 }, carrier: 'UPS', tracking_number: `tracking-${++sequence}`,
      })])).rows[0].shipment;
    }
    async function countPos(orderId: string, vendorId?: string) {
      return (await db.query<{ count: number }>(`SELECT count(*)::integer AS count FROM vendor_orders WHERE order_id=$1${vendorId ? ' AND vendor_id=$2' : ''}`, vendorId ? [orderId, vendorId] : [orderId])).rows[0].count;
    }

    // Demonstrate the existing live RPC's failure when the historical bad PO is present.
    const legacy = await fixture();
    await db.query("UPDATE orders SET status='paid' WHERE id=$1", [legacy.order.id]);
    await db.query("INSERT INTO vendor_orders(order_id,vendor_id,status) VALUES($1,$2,'pending')", [legacy.order.id, localId]);
    for (const action of ['reserve', 'manual']) await assert.rejects(mutate(legacy.order.id, action, legacy.itemIds[0]), /Resolve the supplier PO/);
    assert.equal((await db.query('SELECT * FROM local_shipments WHERE order_id=$1', [legacy.order.id])).rows.length, 0);
    console.log('PASS: historical local-vendor PO reproduces both live RPC shipping blockers'); passed++;

    for (const method of ['card', 'wallet']) {
      for (const mixed of [false, true]) {
        const f = await fixture(mixed, mixed);
        const payment = method === 'card' ? await approveCard(f.order) : await approveWallet(f.order);
        if (method === 'card') assert.equal(payment.outcome, 'finalized');
        assert.equal((await db.query<Row>('SELECT status FROM orders WHERE id=$1', [f.order.id])).rows[0].status, 'paid');
        assert.equal(await countPos(f.order.id, localId), 0);
        assert.equal(await countPos(f.order.id, supplierId), mixed ? 1 : 0);
        const localItem = (await db.query<Row>('SELECT assigned_vendor_id FROM order_items WHERE id=$1', [f.itemIds[0]])).rows[0];
        assert.equal(localItem.assigned_vendor_id, localId, 'local assignment must survive fallback resolution');
        // Both paths use the real shipping function; reserve one unit, manually ship the other.
        assert.equal((await mutate(f.order.id, 'reserve', f.itemIds[0])).status, 'draft');
        assert.equal((await mutate(f.order.id, 'manual', f.itemIds[0])).status, 'shipped');
        if (mixed) await assert.rejects(mutate(f.order.id, 'reserve', f.itemIds[1]), /Resolve the supplier PO/);
        if (method === 'card') assert.equal((await approveCard(f.order)).outcome, 'already_final');
        else { state.providerAttempt = payment; await wallet.reconcileWalletPayment(payment); }
        await vendorPo.autoDraftVendorPosForOrder(f.order.id);
        assert.equal(await countPos(f.order.id, localId), 0, 'retry must never recreate a local PO after shipping');
        assert.equal(await countPos(f.order.id), mixed ? 1 : 0);
        console.log(`PASS: ${method} payment → ${mixed ? 'mixed local/supplier' : 'local only'} drafting → real reserve/manual shipping; retries preserve routing`); passed++;
      }
    }

    for (const failure of ['vendors', 'vendor_orders', 'vendor_warehouses', 'missing_vendor']) {
      const f = await fixture(true, true);
      await db.query("UPDATE orders SET status='paid' WHERE id=$1", [f.order.id]);
      if (failure === 'missing_vendor') state.omitVendor = localId;
      else state.failTable = failure;
      assert.equal(await vendorPo.autoDraftVendorPosForOrder(f.order.id), 0);
      state.failTable = ''; state.omitVendor = '';
      assert.equal(await countPos(f.order.id), 0);
      const assignments = (await db.query<Row>('SELECT assigned_vendor_id FROM order_items WHERE order_id=$1', [f.order.id])).rows;
      assert.ok(assignments.every(item => item.assigned_vendor_id === null), 'failed classification leaves assignments untouched');
    }
    console.log('PASS: failed/partial vendor classification and idempotency lookup fail before writes'); passed++;
    console.log(`${passed} local fulfillment lifecycle scenarios passed.`);
  } finally { await db.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
