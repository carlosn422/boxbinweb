const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,loadTS,A,B}=require('./helpers/runtime.cjs');
const {createHmac}=require('node:crypto');
require('i18next').init({lng:'en',initAsync:false,resources:{en:{translation:require('../src/locales/en/translation.json')}}});

test('PostgreSQL: token credits are atomic, replay-safe and server-only; balances are preserved',async()=>{
 const db=await fixture();
 const credit=(receipt='pi_test',tokens=10)=>db.query('select billing_credit_tokens($1,$2,$3,$4) r',[A,receipt,'price_tokens',tokens]);
 try {
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${A}';select app_sync_profile();reset role;
   update users set tokens='30'::jsonb where auth_user_id='${A}';`);
  assert.equal((await credit()).rows[0].r.balance,40);
  assert.equal((await credit()).rows[0].r.credited,false);
  await assert.rejects(()=>credit('pi_test',11),/BILLING_RECEIPT_MISMATCH/);
  assert.equal((await db.query('select tokens from user_tokens where id=$1',[A])).rows[0].tokens,'40');
  assert.equal((await db.query('select count(*) n from token_purchases')).rows[0].n,1);
  await db.exec(`update users set tokens='25'::jsonb where auth_user_id='${A}'`);
  await assert.rejects(()=>credit('pi_conflict'),/BILLING_BALANCE_CONFLICT/);
  assert.equal((await db.query("select count(*) n from billing_receipts where id='pi_conflict'")).rows[0].n,0);
  await db.exec(`grant all on all tables in schema public to authenticated;
   create policy legacy_subscriptions on subscriptions for all to authenticated using(true) with check(true);
   create policy legacy_profile on users for update to authenticated using(true) with check(true);
   create policy profile_read on users for select to authenticated using(true);
   set role authenticated;set request.jwt.claim.sub='${A}';`);
  await assert.rejects(()=>credit('pi_forged'),/permission denied/);
  await assert.rejects(()=>db.query(`insert into subscriptions("userId","planId",status) values($1,'paid','active')`,[A]),/row-level security/);
  await assert.rejects(()=>db.query(`update users set tokens='999'::jsonb where auth_user_id=$1`,[A]),/APP_PROTECTED_PROFILE_FIELDS/);
  await db.exec(`set request.jwt.claim.sub='${B}'`);
  assert.equal((await db.query('select * from token_purchases')).rows.length,0);
  assert.equal((await db.query('select * from user_tokens')).rows.length,0);
 } finally {await db.close();}
});

test('PostgreSQL: checkout reservation retries and subscription updates preserve one row and billing details',async()=>{
 const db=await fixture();
 const reserve=plan=>db.query('select billing_reserve_checkout($1,$2) r',[A,{planId:plan}]);
 const save=data=>db.query('select billing_save_subscription($1,$2) r',[A,data]);
 try {
  const id=(await reserve('price_paid')).rows[0].r.id;
  assert.equal((await reserve('price_paid')).rows[0].r.id,id);
  assert.equal((await reserve('price_other')).rows[0].r.id,id, 'retain original request until Stripe is reconciled');
  const saved=(await save({planId:'price_paid',status:'incomplete',stripeSubscriptionId:'sub_one',billingDetails:{name:'Example'}})).rows[0].r.id;
  assert.equal((await save({planId:'price_paid',status:'active',stripeSubscriptionId:'sub_one'})).rows[0].r.id,saved);
  assert.equal((await db.query('select count(*) n from billing_subscription_checkouts')).rows[0].n,1);
  assert.equal((await db.query('select "billingDetails" from subscriptions')).rows[0].billingDetails.name,'Example');
  await assert.rejects(()=>save({planId:'price_other',status:'active',stripeSubscriptionId:'sub_two'}),/BILLING_SUBSCRIPTION_CONFLICT/);
  await save({planId:'price_paid',status:'canceled',stripeSubscriptionId:'sub_one'});
  assert.equal((await save({planId:'price_other',status:'active',stripeSubscriptionId:'sub_two'})).rows[0].r.id,saved);
  assert.equal((await db.query('select count(*) n from subscriptions')).rows[0].n,1);
 } finally {await db.close();}
});

function billing(fetch,db={rpc:async()=>({data:{credited:true}})}) {
 return {api:loadTS('supabase/functions/_shared/billing-server.ts',{'https://esm.sh/@supabase/supabase-js@2.109.0':{createClient:()=>db}}, {fetch,Deno:{env:{get:()=> 'test-secret'},serve(){}}}),ctx:{actor:A,owner:A,db}};
}
test('Billing authenticates first and calculates charge from Stripe price, ignoring client amount/tokens',async()=>{
 const calls=[];
 const {api,ctx}=billing(async(url,options)=>{
  calls.push({url,options});return Response.json(url.includes('/prices/')?{id:'price_test',active:true,unit_amount:500,currency:'mxn',product:{active:true,metadata:{tokens:'20'}}}:{id:'pi_test',client_secret:'secret'});
 });
 const response=await api.billingHandler(new Request('https://test',{method:'POST',body:'{}'}));assert.equal(response.status,401);assert.equal(calls.length,0);
 await api.billingOperation(ctx,{operation:'create_token_payment',packageId:'price_test',requestId:'req_test',amount:1,tokens:9999});
 const charge=new URLSearchParams(calls[1].options.body);
 assert.equal(charge.get('amount'),'500');assert.equal(charge.get('metadata[tokens]'),'20');assert.equal(charge.get('currency'),'mxn');
 assert.equal(calls[1].options.headers['Idempotency-Key'],`tokens:${A}:req_test`);
});
test('Billing never credits unpaid, foreign or mismatched payments and reports persistence failures',async()=>{
 let credits=0;const {api,ctx}=billing(()=>{}, {rpc:async()=>{credits++;return {error:{code:'XX000'}};}});
 const intent={id:'pi_test',status:'succeeded',amount_received:500,currency:'usd',metadata:{actor:A,purpose:'boxbin_tokens',tokens:'20',amount:'500',currency:'usd',packageId:'price_test'}};
 for(const invalid of [{...intent,status:'processing'},{...intent,amount_received:1},{...intent,metadata:{...intent.metadata,actor:B}}])await assert.rejects(()=>api.fulfillTokens(ctx,invalid));
 assert.equal(credits,0);await assert.rejects(()=>api.fulfillTokens(ctx,intent),/BILLING_SAVE_FAILED/);assert.equal(credits,1);
});
test('Stripe webhook rejects altered, expired or missing signatures and accepts key rotation signatures',async()=>{
 const {verifyStripeSignature,billingWebhook}=loadTS('supabase/functions/_shared/billing-webhook.ts',{'https://esm.sh/@supabase/supabase-js@2.109.0':{createClient(){throw Error('DB must not be called');}}},{Deno:{env:{get:()=> 'whsec_test'},serve(){}}});
 const body=JSON.stringify({type:'ignored.event'}),time=Math.floor(Date.now()/1000),digest=createHmac('sha256','whsec_test').update(`${time}.${body}`).digest('hex');
 const signature=`t=${time},v1=invalid,v1=${digest}`;
 assert.equal(await verifyStripeSignature(body,signature,'whsec_test'),true);
 assert.equal(await verifyStripeSignature(body+' ',signature,'whsec_test'),false);
 assert.equal(await verifyStripeSignature(body,signature,'whsec_test',(time+301)*1000),false);
 assert.equal((await billingWebhook(new Request('https://test',{method:'POST',body}))).status,400);
 assert.equal((await billingWebhook(new Request('https://test',{method:'POST',body,headers:{'stripe-signature':signature}}))).status,200);
});

test('PostgreSQL: processing debits and purchases share a balance without lost credits, overdrafts or replay',async()=>{
 const db=await fixture();
 try {
  const credit=(receipt,tokens)=>db.query('select billing_credit_tokens($1,$2,$3,$4)',[A,receipt,'price_test',tokens]);
  const debit=(receipt,tokens)=>db.query('select billing_debit_tokens($1,$2,$3) r',[A,receipt,tokens]);
  await credit('pi_first',100);
  assert.equal((await debit('image:test',30)).rows[0].r.balance,70);
  await credit('pi_second',50);
  assert.equal((await debit('video:test',20)).rows[0].r.balance,100);
  assert.equal((await debit('video:test',20)).rows[0].r.debited,false);
  await assert.rejects(()=>debit('video:test',21),/BILLING_RECEIPT_MISMATCH/);
  await assert.rejects(()=>debit('image:overdraft',101),/BILLING_INSUFFICIENT_TOKENS/);
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${A}';`);
  assert.equal((await db.query('select app_token_balance() n')).rows[0].n,'100');
  await assert.rejects(()=>debit('image:forged',1),/permission denied/);
  await db.exec(`set request.jwt.claim.sub='${B}'`);
  assert.equal((await db.query('select app_token_balance() n')).rows[0].n,'0');
 }finally{await db.close();}
});
