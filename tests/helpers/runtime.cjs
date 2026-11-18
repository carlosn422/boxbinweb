const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..');
function loadTS(filename, replacements = {}, globals = {}, cache = new Map()) {
  const absolute = path.resolve(root, filename);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const mod = {exports:{}}; cache.set(absolute,mod);
  const code = ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const realRequire = createRequire(absolute);
  const req = name => {
    if (name in replacements) return replacements[name];
    const local = name.startsWith('@/') ? path.join(root,'src',name.slice(2)) : name.startsWith('.') ? path.resolve(path.dirname(absolute),name) : null;
    if (local) {
      if (local.endsWith('.json')) return realRequire(local);
      const source = [local,local+'.ts',local+'.tsx'].find(p=>fs.existsSync(p)&&/\.tsx?$/.test(p));
      if (source) return loadTS(source,replacements,globals,cache);
    }
    return realRequire(name);
  };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{console,URL,URLSearchParams,Request,Response,Blob,ArrayBuffer,Uint8Array,AbortSignal,TextEncoder,TextDecoder,crypto:require('node:crypto').webcrypto,Deno:{serve(){},env:{get:()=>undefined}},setTimeout,clearTimeout,setInterval,clearInterval,AbortController,atob,btoa,...globals},{filename:absolute})(req,mod,mod.exports);
  return mod.exports;
}
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';
async function fixture() {
  const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key,raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('sub', auth.uid())$$;
    grant usage on schema auth, public to authenticated, anon, service_role;grant execute on function auth.uid() to authenticated;
    create table public.bins(id text primary key default gen_random_uuid()::text,name text,description text,location jsonb,"userId" text,"createdAt" timestamptz);
    create table public.locations(id text primary key default gen_random_uuid()::text,name text,description text,address text,"userId" text,"createdAt" timestamptz);
    create table public.items(id text primary key default gen_random_uuid()::text,name text,description text,tags jsonb default '[]',cuantity text,value text,"binId" text references bins(id),"userId" text,"createdAt" timestamptz);
    insert into auth.users(id,raw_user_meta_data) values('${A}','{"inventory_user_id":"${B}"}'),('${B}','{}');
    insert into bins(id,name,"userId") values('a-box','A','${A}'),('a-dest','Destino','${A}'),('b-box','B','${B}');
    insert into locations(id,name,"userId") values('a-loc','Bodega','${A}'),('b-loc','Privada','${B}');
    insert into items(id,name,cuantity,value,"binId","userId") select 'item-'||n,'Taladro '||n,'2','100','a-box','${A}' from generate_series(1,151) n;
    insert into items(id,name,cuantity,value,"binId","userId") values('secret','Secreto','1','999','b-box','${B}');`);
  await db.exec(fs.readFileSync(path.join(root,'tests/fixtures/crud-base.sql'),'utf8'));
  await db.exec(`alter table auth.users add column email text;
    create schema storage; create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text);
    create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
    alter table storage.objects enable row level security;`);
  for (const file of fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
  return db;
}

module.exports={loadTS,fixture,A,B};
