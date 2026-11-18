const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,loadTS,A,B}=require('./helpers/runtime.cjs');
require('i18next').init({lng:'en',initAsync:false,resources:{en:{translation:require('../src/locales/en/translation.json')}}});

test('PostgreSQL: profile creation, sharing and revocation, QR defaults and storage isolation',async()=>{
 const db=await fixture();
 try {
  await db.exec(`grant all on all tables in schema public to authenticated; grant usage on schema storage to authenticated; grant all on storage.objects to authenticated;
   alter table bins enable row level security; alter table items enable row level security; alter table locations enable row level security;
   set role authenticated;set request.jwt.claim.sub='${B}';`);
  const recipient=(await db.query('select app_sync_profile() r')).rows[0].r;
  assert.equal((await db.query('select app_sync_profile() r')).rows[0].r.id,recipient.id);
  await db.exec(`set request.jwt.claim.sub='${A}'`);
  const profile=(await db.query('select app_sync_profile() r')).rows[0].r;
  assert.ok(profile.id);assert.notEqual(profile.id,A);
  await assert.rejects(()=>db.query("select app_grant_access('missing')"),/APP_USER_NOT_FOUND/);
  await assert.rejects(()=>db.query('select app_grant_access($1)',['user_'+A.replaceAll('-','')]),/APP_INVALID_RECIPIENT/);
  const share=(await db.query('select app_grant_access($1) r',['user_'+B.replaceAll('-','')])).rows[0].r;
  assert.equal((await db.query('select app_grant_access($1) r',['user_'+B.replaceAll('-','')])).rows[0].r.id,share.id);
  await db.exec(`set request.jwt.claim.sub='${B}'`);
  assert.equal((await db.query("select id from bins where id='a-box'")).rows.length,1);
  assert.equal((await db.query("update bins set name='hijacked' where id='a-box' returning id")).rows.length,0);
  assert.equal((await db.query('delete from shared_access where id=$1 returning id',[share.id])).rows.length,0);
  await db.exec(`set request.jwt.claim.sub='${A}'`);
  assert.equal((await db.query('delete from shared_access where id=$1 returning id',[share.id])).rows.length,1);
  await db.exec(`set request.jwt.claim.sub='${B}'`);
  assert.equal((await db.query("select id from bins where id='a-box'")).rows.length,0);
  await db.query(`insert into storage.objects(bucket_id,name) values('binventory-storage',$1)`,[B+'/items/test.png']);
  await assert.rejects(()=>db.query(`insert into storage.objects(bucket_id,name) values('binventory-storage',$1)`,[A+'/items/foreign.png']),/row-level security/);
  await db.exec(`set request.jwt.claim.sub='${A}'`);
  assert.equal((await db.query('delete from storage.objects returning id')).rows.length,0);
  await db.exec(`set request.jwt.claim.sub='${B}'`);
  assert.equal((await db.query('delete from storage.objects returning id')).rows.length,1);
  await db.exec('reset role');
  const qr=(await db.query('insert into qrcodes(guid,"requestId","userId") values($1,$2,$3) returning id',['guid','request',A])).rows[0];
  assert.match(qr.id,/^[0-9a-f-]{36}$/);
 } finally {await db.close();}
});

test('QR batches include distinct IDs, reject invalid quantities, propagate failed writes and load more than 1000',async()=>{
 let rows,fail=false;
 const supabase={from:()=>({insert(value){rows=value;return {select:async()=>({data:fail?null:rows,error:fail?Error('denied'):null})};},select(){return this;},eq(){return this;},order(){return this;},range:async(start)=>({data:Array.from({length:start===0?1000:4},(_,i)=>({id:start+i})),error:null})})};
 const service=loadTS('src/services/recordService.ts',{'@/lib/supabase':{supabase}});
 await service.createQrLabels(A,100,'request');
 assert.equal(new Set(rows.map(r=>r.id)).size,100);assert.ok(rows.every(r=>r.id&&r.guid&&r.userId===A&&r.requestId==='request'));
 for(const count of [0,101,1.2,NaN])await assert.rejects(()=>service.createQrLabels(A,count));
 fail=true;await assert.rejects(()=>service.createQrLabels(A,1),/denied/);
 assert.equal((await service.loadQrLabels(A)).length,1004);
});
