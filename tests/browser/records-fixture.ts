import { type Page } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
export const en = JSON.parse(readFileSync('src/locales/en/translation.json', 'utf8'));
export const owner = '11111111-1111-4111-8111-111111111111';
export const timestamp = '2026-11-18T12:00:00Z';

export async function setup(page: Page) {
  const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
  const url = env.match(/^VITE_SUPABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '') || 'https://xfqmknrtozlxoscotcqa.supabase.co';
  const user = { id: owner, email: 'inventory@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: timestamp };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: owner, role: 'authenticated', exp })).toString('base64url')}.test`;
  await page.addInitScript(({ key, session }) => {
    localStorage.setItem('lang', 'en'); localStorage.setItem(key, JSON.stringify(session));
  }, { key: `sb-${new URL(url).hostname.split('.')[0]}-auth-token`, session: { user, access_token: token, refresh_token: 'fixture', expires_at: exp, expires_in: 3600, token_type: 'bearer' } });
  const rows: Record<string, any[]> = { bins: [], items: [], locations: [], qrcodes: [], shared_access: [] };
  const state = { rows, fail: '', writes: [] as any[] };
  await page.route('**/*', async route => {
    const req = route.request(), u = new URL(req.url()), method = req.method();
    if (['127.0.0.1', 'localhost'].includes(u.hostname)) return route.continue();
    let data: any = [], status = 200;
    if (u.hostname !== new URL(url).hostname) return route.fulfill({ status, contentType: 'application/json', body: '{}' });
    if (u.pathname.includes('/auth/v1/')) data = user;
    else if (u.pathname.includes('/functions/v1/')) data = { metadata: { bins: '100', items: '100', locations: '100' }, product: { name: 'Test' } };
    else if (u.pathname.endsWith('/rpc/app_sync_profile')) data = { id: owner };
    else if (u.pathname.endsWith('/rpc/app_grant_access')) {
      if (state.fail === 'SHARE') { status = 400; data = { message: 'Share denied for test' }; }
      else { const row = { id: 'share-test', ownerUserId: owner, grantedUserId: 'friend', createdAt: timestamp }; rows.shared_access = [row]; data = { id: row.id }; }
    } else if (u.pathname.endsWith('/rpc/inventory_delete_record')) {
      const body = req.postDataJSON();
      const table = body.p_table;
      state.writes.push({ table, method: 'RPC_DELETE', body });
      const row = rows[table].find(row => row.id === body.p_id && row.userId === body.p_owner);
      if (state.fail === `DELETE:${table}`) { status = 400; data = { code: '42501', message: 'Write denied for test' }; }
      else if (!row) { status = 400; data = { message: 'INVENTORY_RECORD_UNAVAILABLE' }; }
      else { rows[table] = rows[table].filter(item => item !== row); data = { id: row.id }; }
    } else if (u.pathname.includes('/rest/v1/')) {
      const table = u.pathname.split('/').pop()!;
      if (table === 'users') data = [{ id: owner, uid: owner, username: 'tester' }, { id: 'friend', uid: 'friend', username: 'friend', displayName: 'Test Friend' }];
      if (table === 'subscriptions') data = [];
      if (rows[table]) {
        const matches = (row: any) => [...u.searchParams].every(([key, val]) => !val.startsWith('eq.') || row[key] === val.slice(3));
        data = rows[table].filter(matches);
        if (['POST', 'PATCH', 'DELETE'].includes(method)) {
          state.writes.push({ table, method, body: req.postDataJSON(), url: u.toString() });
          if (state.fail === `${method}:${table}`) { status = 400; data = { code: '42501', message: 'Write denied for test' }; }
          else if (method === 'POST') {
            const body = req.postDataJSON();
            const batch = Array.isArray(body) ? body : [body];
            if (batch.some(row => !row.id)) { status = 400; data = { code: '23502', message: `null value in column "id" of relation "${table}" violates not-null constraint` }; }
            else { rows[table].push(...batch); data = batch; }
          } else if (method === 'PATCH') {
            for (const row of data) Object.assign(row, req.postDataJSON());
          } else rows[table] = rows[table].filter(row => !matches(row));
        }
        if (status === 200 && req.headers()['accept']?.includes('vnd.pgrst.object')) {
          if (data.length !== 1) { status = 406; data = { code: 'PGRST116', message: 'No accessible record' }; }
          else data = data[0];
        }
      }
    }
    return route.fulfill({ status, contentType: 'application/json', headers: { 'content-range': `0-0/${Array.isArray(data) ? data.length : 1}` }, body: method === 'HEAD' ? '' : JSON.stringify(data) });
  });
  return state;
}
