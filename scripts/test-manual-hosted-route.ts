import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import * as environment from '../src/lib/authnet/environment';

const require = createRequire(import.meta.url);
const origin = 'https://checkout.test';
process.env.ADMIN_SESSION_SECRET = 'a-fixture-key-only-for-this-isolated-test';
process.env.AUTHNET_ENVIRONMENT = 'sandbox';

function load(file: string, modules: Record<string, unknown> = {}): any {
  const compiled = ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const target = { exports: {} };
  new Function('require','module','exports',compiled)((key: string) => {
    if (key === 'server-only') return {};
    if (key in modules) return modules[key];
    if (['node:crypto','next/server','zod'].includes(key)) return require(key);
    throw new Error('Unexpected dependency '+key);
  },target,target.exports);
  return target.exports;
}
const grants=load('../src/lib/checkout/manual-payment-grant.ts');
const orderId='11111111-1111-4111-8111-111111111111';
const token=grants.issueManualPaymentGrant({ orderId, amountCents:3998 });
const reviewId=grants.manualPaymentReviewId(token);
const address={ first_name:'Fixture',last_name:'Buyer',address1:'Test address',city:'Test City',state:'CA',zip:'92008' };

function setup() {
  const rpc: Array<{ name:string; args:Record<string,unknown> }>=[];
  const provider: Array<Record<string,unknown>>=[];
  const state = { preview:false, published:true, claimed: {
    state:'claimed', orderNumber:'LCG-TEST',total:39.98,customerEmail:'test@example.test',billingAddress:address,shippingAddress:address,
  } as Record<string,unknown> };
  const processing=load('../src/lib/checkout/manual-hosted.ts',{
    '@/lib/authnet/environment':environment,
    '@/lib/authnet/hosted':{ getHostedPaymentToken:(params:Record<string,unknown>) => {
      provider.push(params); return {ok:true,formToken:'provider-token',hostedUrl:'https://test.authorize.net/payment/payment'};
    } },
    '@/lib/supabase/admin':{createAdminClient:()=>({rpc:(name:string,args:Record<string,unknown>)=>{
      rpc.push({name,args});
      return {data:name==='claim_manual_hosted_payment' ? state.claimed : state.published,error:null};
    }})},
  });
  const { POST } = load('../src/app/api/checkout/manual-pay/route.ts',{
    '@/lib/checkout/manual-payment-grant':grants,
    '@/lib/checkout/manual-hosted':processing,
    '@/lib/preview-mode':{isReadOnlyPreview:()=>state.preview},
  });
  async function request(body:object={reviewId},cookie=token,requestOrigin=origin) {
    return await POST(new NextRequest(origin+'/api/checkout/manual-pay/',{
      method:'POST', headers:{Origin:requestOrigin,'Content-Type':'application/json',Cookie:grants.MANUAL_PAYMENT_COOKIE+'='+cookie},
      body:JSON.stringify(body),
    }));
  }
  return { state, rpc, provider, request };
}

test('review, grant, origin and preview guards precede any financial I/O',async()=>{
  const h=setup();
  assert.equal((await h.request({reviewId},'invalid')).status,403);
  assert.equal((await h.request({reviewId:'other-tab'})).status,409);
  assert.equal((await h.request({reviewId},token,'https://other.test')).status,403);
  h.state.preview=true;
  assert.equal((await h.request()).status,409);
  assert.equal(h.rpc.length,0);
  assert.equal(h.provider.length,0);
});
test('charge uses saved order amount and recipient, with no quote or secret in return URLs',async()=>{
  const h=setup();
  const res=await h.request({reviewId,orderId:'other',amount:0.01,customerEmail:'other@example.test'});
  assert.equal(res.status,200);
  assert.equal(res.headers.get('cache-control'),'private, no-store');
  assert.deepEqual(await res.json(),{success:true,hostedUrl:'https://test.authorize.net/payment/payment',formToken:'provider-token'});
  assert.equal(h.rpc[0].args.p_order_id,orderId);
  assert.equal(h.rpc[0].args.p_amount_cents,3998);
  assert.equal(h.provider.length,1);
  const input=h.provider[0];
  assert.equal(input.orderNumber,'LCG-TEST');
  assert.equal(input.amount,39.98);
  assert.equal(input.customerEmail,'test@example.test');
  assert.equal(input.returnUrl,origin+'/api/checkout/hosted-callback/?orderNumber=LCG-TEST');
  assert.equal(input.cancelUrl,origin+'/pay/');
  assert.equal(h.rpc[1].name,'publish_manual_hosted_payment');
  assert.equal(h.rpc[1].args.p_claim_id,h.rpc[0].args.p_claim_id);
});
test('no provider token escapes on cancellation or changed saved price; ready retries reuse persisted token',async()=>{
  const h=setup();
  h.state.published=false;
  const lost=await h.request();
  assert.equal(lost.status,409);
  assert.equal((await lost.text()).includes('provider-token'),false);
  h.state.claimed.total=39.99;
  assert.equal((await h.request()).status,409);
  for (const state of ['review','busy','unavailable']) {
    h.state.claimed={state};
    assert.equal((await h.request()).status,409);
  }
  h.state.claimed={state:'ready',formToken:'persisted'};
  assert.equal((await (await h.request()).json()).formToken,'persisted');
  assert.equal(h.provider.length,1);
});
