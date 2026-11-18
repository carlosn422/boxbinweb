const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const vm = require('node:vm');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');

function service(result) {
  const calls = [];
  const query = {};
  for (const name of ['insert', 'update', 'delete', 'eq', 'select']) query[name] = (...args) => { calls.push([name, ...args]); return query; };
  query.single = async () => result;
  const mod = { exports: {} };
  const code = ts.transpileModule(readFileSync('src/services/inventoryService.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`) (name => {
    if (name === 'uuid') return { v4: randomUUID };
    if (name === 'i18next') return { t: key => key };
    return { supabase: { rpc: async (name, args) => { calls.push(['rpc', name, args]); return result; }, from: table => { calls.push(['from', table]); return query; } } };
  }, mod, mod.exports);
  return { ...mod.exports, calls };
}

test('Every create sends a fresh ID and trusted owner even when form supplies null/spoofed IDs', async () => {
  const ids = [];
  for (const table of ['bins', 'items', 'locations']) {
    const s = service({ data: { id: 'saved' }, error: null });
    await s.createInventoryRecord(table, 'owner', { id: null, userId: 'foreign', name: 'Test' });
    const payload = s.calls.find(c => c[0] === 'insert')[1];
    assert.match(payload.id, /^[0-9a-f-]{36}$/); assert.equal(payload.userId, 'owner'); ids.push(payload.id);
  }
  assert.equal(new Set(ids).size, 3);
});
test('All mutations reject missing sessions before calling Supabase', async () => {
  const s = service({ data: null, error: null });
  await assert.rejects(s.createInventoryRecord('bins', undefined, {}));
  await assert.rejects(s.updateInventoryRecord('items', undefined, 'id', {}));
  await assert.rejects(s.deleteInventoryRecord('locations', undefined, 'id'));
  assert.equal(s.calls.length, 0);
});
test('Updates and deletes require a returned row and filter both owner and ID', async () => {
  for (const result of [{ data: null, error: { code: 'PGRST116', message: 'No rows' } }, { data: null, error: null }]) {
    for (const table of ['bins', 'items', 'locations']) {
      const s = service(result);
      await assert.rejects(s.updateInventoryRecord(table, 'owner', 'id', { id: 'spoofed', userId: 'foreign', name: 'Edited' }));
      await assert.rejects(s.deleteInventoryRecord(table, 'owner', 'id'));
      assert.equal(s.calls.filter(c => c[0] === 'eq' && c[1] === 'userId' && c[2] === 'owner').length, table === 'items' ? 2 : 1);
      assert.equal(s.calls.find(c => c[0] === 'update')[1].id, undefined);
    }
  }
});

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
    create table auth.users(id uuid primary key, raw_app_meta_data jsonb default '{}');
    create table copilot_accounts(auth_user_id uuid primary key, inventory_user_id text);
    create function copilot_owner(actor uuid) returns text language sql stable security definer as $$
      select coalesce(c.inventory_user_id, nullif(u.raw_app_meta_data->>'inventory_user_id',''),u.id::text)
      from auth.users u left join copilot_accounts c on c.auth_user_id=u.id where u.id=actor
    $$;
    create table locations(id text primary key, name text, address text, "userId" text);
    create table bins(id text primary key, name text, location jsonb, "userId" text);
    create table items(id text primary key, name text, "binId" text, "userId" text);
    create table qrcodes(id text primary key, "binId" jsonb, "isUsed" boolean, "dateUsed" jsonb, "userId" text);
    grant usage on schema public to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    ${['bins','items','locations','qrcodes'].map(t => `alter table ${t} enable row level security; create policy own on ${t} to authenticated using ("userId"=current_setting('test.owner')) with check ("userId"=current_setting('test.owner'));`).join('\n')}
  `);
  await db.exec(readFileSync('supabase/migrations/202611180001_inventory_integrity.sql', 'utf8'));
  await db.exec(`insert into locations values('loc','Old','Address','A');
    insert into bins values('bin','Box','{"id":"loc","name":"Stale"}','A'),('foreign','Other',null,'B');
    insert into items values('item','Item','bin','A');
    insert into qrcodes values('qr','"bin"',true,to_jsonb(now()),'A');
    set role authenticated; set test.owner='A';`);
  return db;
}

test('SQL: defaults, location edits/deletion, and bin deletion preserve intended relationships', async () => {
  const db = await fixture();
  try {
    for (const table of ['locations', 'bins', 'items']) {
      const columns = table === 'items' ? ',"binId"' : '';
      const values = table === 'items' ? ",'bin'" : '';
      const { rows } = await db.query(`insert into ${table}(name,"userId"${columns}) values('Generated','A'${values}) returning id`);
      assert.match(rows[0].id, /^[0-9a-f-]{36}$/);
    }
    await db.exec(`update locations set name='Renamed', address='New address' where id='loc'`);
    assert.equal((await db.query(`select location->>'name' as name from bins where id='bin'`)).rows[0].name, 'Renamed');
    await db.query(`select inventory_delete_record('locations','A','loc')`);
    assert.equal((await db.query(`select location from bins where id='bin'`)).rows[0].location, null);
    assert.equal((await db.query(`select count(*)::int as n from items where "binId"='bin'`)).rows[0].n, 2);
    await db.query(`select inventory_delete_record('bins','A','bin')`);
    assert.equal((await db.query(`select count(*)::int as n from items`)).rows[0].n, 0);
    const qr = (await db.query(`select * from qrcodes where id='qr'`)).rows[0];
    assert.equal(qr.binId, null); assert.equal(qr.isUsed, false); assert.equal(qr.dateUsed, null);
    await db.exec('reset role');
    assert.equal((await db.query(`select count(*)::int as n from bins where id='foreign'`)).rows[0].n, 1);
  } finally { await db.close(); }
});
test('SQL: failed QR release rolls back the bin AND item deletions', async () => {
  const db = await fixture();
  try {
    await db.exec(`reset role; create policy deny_qr_update on qrcodes as restrictive for update to authenticated using(false); set role authenticated;`);
    await assert.rejects(db.exec(`delete from bins where id='bin'`), /INVENTORY_QR_RELEASE_DENIED/);
    assert.equal((await db.query(`select count(*)::int as n from bins where id='bin'`)).rows[0].n, 1);
    assert.equal((await db.query(`select count(*)::int as n from items where id='item'`)).rows[0].n, 1);
  } finally { await db.close(); }
});
test('SQL: denied location propagation rolls back rename and deletion', async () => {
  const db = await fixture();
  try {
    await db.exec(`reset role; create policy deny_bin_update on bins as restrictive for update to authenticated using(false); set role authenticated;`);
    await assert.rejects(db.exec(`update locations set name='Forbidden' where id='loc'`), /INVENTORY_LOCATION_SYNC_DENIED/);
    await assert.rejects(db.exec(`delete from locations where id='loc'`), /INVENTORY_LOCATION_DETACH_DENIED/);
    assert.equal((await db.query(`select name from locations where id='loc'`)).rows[0].name, 'Old');
  } finally { await db.close(); }
});
test('SQL: RLS and parent validation reject another owner and missing parents', async () => {
  const db = await fixture();
  try {
    for (const binId of ['foreign', 'missing']) await assert.rejects(db.exec(`insert into items(name,"binId","userId") values('Bad','${binId}','A')`), /INVENTORY_BIN_UNAVAILABLE/);
    await assert.rejects(db.exec(`insert into bins(name,location,"userId") values('Bad','{"id":"missing"}','A')`), /INVENTORY_LOCATION_UNAVAILABLE/);
    await assert.rejects(db.exec(`insert into locations(name,"userId") values('Bad','B')`), /row-level security/);
    assert.equal((await db.query(`delete from bins where id='foreign' returning id`)).rows.length, 0);
  } finally { await db.close(); }
});

test('SQL: canonical owners work without a profile and use only trusted owner mappings', async () => {
  const db = await fixture();
  const actor = '11111111-1111-4111-8111-111111111111';
  try {
    await db.exec(`reset role;
      insert into auth.users values('${actor}','{}');
      set role authenticated; set test.actor='${actor}'; set test.owner='legacy-owner';`);
    await db.exec(`insert into locations(id,name,"userId") values('fresh','New','${actor}')`);
    await db.exec(`update locations set name='Updated' where id='fresh'`);
    assert.equal((await db.query(`select name from locations where id='fresh'`)).rows[0].name, 'Updated');
    await db.query(`select inventory_delete_record('locations','${actor}','fresh')`);
    await assert.rejects(db.exec(`insert into locations(name,"userId") values('Foreign','B')`), /row-level security/);
    await db.exec(`reset role; insert into copilot_accounts values('${actor}','mapped-owner'); set role authenticated;`);
    await db.exec(`insert into bins(name,"userId") values('Mapped','mapped-owner')`);
    assert.equal((await db.query(`select inventory_current_owner() as owner`)).rows[0].owner, 'mapped-owner');
  } finally { await db.close(); }
});
