import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

async function main() {
  const db = new PGlite();
  try {
    await db.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE DOMAIN citext AS text;');
    for (const filename of ['0001_initial_schema.sql', '20261031193901_manual_order_payment_sessions.sql']) {
      const sql = await readFile('supabase/migrations/' + filename, 'utf8');
      await db.exec(sql.replace('CREATE EXTENSION IF NOT EXISTS citext;', ''));
    }
    const scalar = async (sql: string, params: unknown[] = []) =>
      (await db.query<{ result: any }>(sql, params)).rows[0].result;
    async function order(source = 'manual', total = 39.98) {
      const id = await scalar(`INSERT INTO orders(customer_email,source,subtotal,total,billing_address,shipping_address)
        VALUES('buyer@example.test',$1,$2,$2,'{}','{}') RETURNING id AS result`, [source,total]);
      await db.query(`INSERT INTO order_items(order_id,product_sku,product_name,quantity,unit_price,line_subtotal)
        VALUES($1,'TEST','Test product',2,19.99,39.98)`, [id]);
      return id;
    }
    const claim = (id: string, key = randomUUID(), cents = 3998, env = 'sandbox') =>
      scalar('SELECT claim_manual_hosted_payment($1,$2,$3,$4) AS result', [id,cents,env,key]);
    const publish = (id: string, key: string) =>
      scalar('SELECT publish_manual_hosted_payment($1,$2,$3) AS result', [id,key,'test-form-token']);
    const cancel = (id: string, confirmed: boolean, status = 'pending') =>
      scalar('SELECT cancel_manual_payment_order($1,$2,$3,$4) AS result', [id,status,confirmed,'Cancellation test']);
    const manual = await order();
    const firstClaim = randomUUID();
    assert.equal((await claim(manual, firstClaim, 3999)).state,'unavailable');
    assert.equal((await claim(await order('website'))).state,'unavailable');
    assert.equal((await claim(await order('manual',0), randomUUID(), 0)).state,'unavailable');
    const started = await claim(manual,firstClaim);
    assert.equal(started.state,'claimed');
    assert.equal(started.total,39.98);
    assert.equal((await claim(manual)).state,'busy');
    assert.equal((await claim(manual, randomUUID(), 3998, 'production')).state,'unavailable');
    await db.query("UPDATE manual_order_payment_sessions SET started_at=now()-interval '61 seconds' WHERE order_id=$1",[manual]);
    const replacement = randomUUID();
    assert.equal((await claim(manual,replacement)).state,'claimed');
    assert.equal(await publish(manual,firstClaim),false,'stale worker cannot deliver a token');
    assert.equal(await publish(manual,replacement),true);
    assert.equal(await publish(manual,replacement),false);
    assert.deepEqual(await claim(manual), {state:'ready',formToken:'test-form-token'});
    await assert.rejects(db.query('UPDATE orders SET total=total+1 WHERE id=$1',[manual]),/Check the hosted payment/);
    await assert.rejects(db.query("UPDATE orders SET status='cancelled' WHERE id=$1",[manual]),/Check the hosted payment/);
    await assert.rejects(cancel(manual,true),/Wait 15 minutes/);
    await db.query("UPDATE manual_order_payment_sessions SET started_at=now()-interval '17 minutes',issued_at=now()-interval '16 minutes' WHERE order_id=$1",[manual]);
    assert.equal((await claim(manual)).state,'review','an expired issued token is never regenerated automatically');
    await assert.rejects(cancel(manual,false),/Confirm in Authorize.net/);
    assert.equal(await cancel(manual,true,'payment_held'),false);
    assert.equal(await cancel(manual,true),true);
    assert.equal((await claim(manual)).state,'unavailable');
    const unfinished = await order();
    const inFlight = randomUUID();
    await claim(unfinished,inFlight);
    assert.equal(await cancel(unfinished,false),true);
    assert.equal(await publish(unfinished,inFlight),false,'cancel while provider request is in flight suppresses its response');
    const paid = await order();
    const paidClaim = randomUUID();
    await claim(paid,paidClaim);
    await db.query("UPDATE orders SET status='paid' WHERE id=$1",[paid]);
    assert.equal(await publish(paid,paidClaim),false);
    assert.equal((await claim(paid)).state,'unavailable');
    const inconsistent = await order();
    await claim(inconsistent);
    await db.query("INSERT INTO payments(order_id,type,amount,status) VALUES ($1,'auth_capture',39.98,'succeeded')",[inconsistent]);
    assert.equal((await claim(inconsistent)).state,'unavailable');
    await assert.rejects(cancel(inconsistent,true),/Reconcile its payment status/);
    const ordinary = await order();
    assert.equal(await cancel(ordinary,false),true);
    for (const role of ['anon','authenticated']) {
      assert.equal(await scalar("SELECT has_table_privilege($1,'manual_order_payment_sessions','SELECT') AS result",[role]),false);
      assert.equal(await scalar("SELECT has_function_privilege($1,'claim_manual_hosted_payment(uuid,bigint,text,uuid)','EXECUTE') AS result",[role]),false);
    }
    assert.equal(await scalar("SELECT relrowsecurity AS result FROM pg_class WHERE oid='manual_order_payment_sessions'::regclass"),true);
    console.log('PASS: manual quote identity, lock/retry behavior, stale worker, same-token replay, expiry, cancellation, paid status, and access grants');
  } finally {
    await db.close();
  }
}
main().catch(error => { console.error(error); process.exitCode=1; });
