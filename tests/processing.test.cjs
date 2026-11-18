const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,loadTS,A,B}=require('./helpers/runtime.cjs');
test('PostgreSQL processing: concurrent-operation accounting, replay, insufficient balance, ownership and errors',async()=>{
 const db=await fixture();
 try {
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${A}';select app_sync_profile();reset role;update users set tokens='100'::jsonb where auth_user_id='${A}';`);
  const debit=(receipt,tokens)=>db.query('select processing_debit_tokens($1,$2,$3) r',[A,receipt,tokens]);
  assert.equal((await debit('image:first',30)).rows[0].r.balance,70);
  assert.equal((await debit('video:second',20)).rows[0].r.balance,50);
  assert.equal((await debit('video:second',20)).rows[0].r.debited,false);
  await assert.rejects(()=>debit('video:second',21),/PROCESSING_RECEIPT_MISMATCH/);
  await assert.rejects(()=>debit('image:overdraft',51),/PROCESSING_INSUFFICIENT_TOKENS/);
  assert.equal((await db.query('select tokens from users where auth_user_id=$1',[A])).rows[0].tokens,50);
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${A}'`);
  assert.equal((await db.query('select app_token_balance() n')).rows[0].n,'50');
  await assert.rejects(()=>debit('image:forged',1),/permission denied/);
  await db.exec(`set request.jwt.claim.sub='${B}'`);
  assert.equal((await db.query('select app_token_balance() n')).rows[0].n,'0');
  await db.exec("reset role;reset request.jwt.claim.sub;");
  await db.query('update users set tokens=$1 where auth_user_id=$2',[45,A]);
  await assert.rejects(()=>debit('image:conflict',1),/PROCESSING_BALANCE_CONFLICT/);
  assert.equal((await db.query("select count(*) n from processing_token_usage where id='image:conflict'")).rows[0].n,0);
 } finally {await db.close();}
});

test('Image promotion rejects missing login, foreign paths/hosts and failed copy, preserves source',async()=>{
 let copies=[],fail=false;
 const bucket={
   copy:async(...args)=>{copies.push(args);return {error:fail?Error('offline'):null};},
   getPublicUrl:p=>({data:{publicUrl:'https://fixture/'+p}}),
 };
 const ctx={actor:A,owner:A,db:{storage:{from:()=>bucket}}};
 const server=loadTS('supabase/functions/_shared/storage-server.ts',{'./copilot-server.ts':{authenticate:async req=>{if(!req.headers.get('authorization'))throw {code:'COPILOT_UNAUTHORIZED'};return ctx},cors:{},json:(data,status=200)=>Response.json(data,{status}),readBody:req=>req.json()}},{Deno:{env:{get:()=> 'https://fixture.supabase.co'},serve(){}}});
 const request=(path,auth=true)=>new Request('https://test',{method:'POST',headers:auth?{authorization:'Bearer fixture'}:{},body:JSON.stringify({imageUrl:path,newFolder:'items',deleteOriginal:true})});
 const own=`https://fixture.supabase.co/storage/v1/object/public/binventory-storage/${A}/file_processing/image.png`;
 assert.equal((await server.moveInventoryImage(request(own,false))).status,401);
 assert.equal((await server.moveInventoryImage(request(own.replace(A,B)))).status,403);
 assert.equal((await server.moveInventoryImage(request(own.replace('fixture.supabase.co','foreign.test')))).status,403);
 assert.equal(copies.length,0);
 const response=await server.moveInventoryImage(request(own));assert.equal(response.status,200);
 assert.ok((await response.json()).newPath.startsWith(A+'/items/'));
 fail=true;assert.equal((await server.moveInventoryImage(request(own))).status,503);
});

test('Processing completion persists the result and debits atomically, rolls back errors and preserves replays',async()=>{
 const db=await fixture();
 try{
  await db.query('insert into user_tokens(id,tokens) values($1,100)',[A]);
  await db.query('insert into image_requests(id,"userId") values($1,$2)',['image-job',A]);
  const complete=(id,payload)=>db.query('select processing_complete($1,$2,$3,$4,$5) r',[A,'image',id,10,payload]);
  await assert.rejects(()=>complete('missing',{cost:0}),/PROCESSING_NOT_FOUND/);
  await assert.rejects(()=>complete('image-job',{cost:'invalid'}),/invalid input/);
  assert.equal((await db.query('select tokens from user_tokens where id=$1',[A])).rows[0].tokens,'100');
  await complete('image-job',{cost:0,result:{items:[{name:'Fixture'}]}});
  assert.equal((await db.query('select tokens from user_tokens where id=$1',[A])).rows[0].tokens,'90');
  await complete('image-job',{cost:0,result:{items:[]}});
  const row=(await db.query('select success,result from image_requests where id=$1',['image-job'])).rows[0];
  assert.equal(row.success,true);assert.equal(row.result.items.length,1);
 }finally{await db.close();}
});
