import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const en = JSON.parse(readFileSync('src/locales/en/translation.json', 'utf8'));
const owner = '11111111-1111-4111-8111-111111111111';
const timestamp = '2026-11-18T12:00:00Z';

async function setup(page: Page) {
  const env = readFileSync('.env', 'utf8');
  const url = env.match(/^VITE_SUPABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '') || 'https://xfqmknrtozlxoscotcqa.supabase.co';
  const user = { id: owner, email: 'inventory@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: timestamp };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: owner, role: 'authenticated', exp })).toString('base64url')}.test`;
  await page.addInitScript(({ key, session }) => {
    localStorage.setItem('lang', 'en'); localStorage.setItem(key, JSON.stringify(session));
  }, { key: `sb-${new URL(url).hostname.split('.')[0]}-auth-token`, session: { user, access_token: token, refresh_token: 'fixture', expires_at: exp, expires_in: 3600, token_type: 'bearer' } });
  const rows: Record<string, any[]> = { bins: [], items: [], locations: [] };
  const state = { rows, fail: '', writes: [] as any[] };
  await page.route('**/*', async route => {
    const req = route.request(), u = new URL(req.url()), method = req.method();
    if (['127.0.0.1', 'localhost'].includes(u.hostname)) return route.continue();
    let data: any = [], status = 200;
    if (u.hostname !== new URL(url).hostname) return route.fulfill({ status, contentType: 'application/json', body: '{}' });
    if (u.pathname.includes('/auth/v1/')) data = user;
    else if (u.pathname.includes('/functions/v1/')) data = { metadata: { bins: '100', items: '100', locations: '100' }, product: { name: 'Test' } };
    else if (u.pathname.endsWith('/rpc/inventory_delete_record')) {
      const body = req.postDataJSON();
      const table = body.p_table;
      state.writes.push({ table, method: 'RPC_DELETE', body });
      const row = rows[table].find(row => row.id === body.p_id && row.userId === body.p_owner);
      if (state.fail === `DELETE:${table}`) { status = 400; data = { code: '42501', message: 'Write denied for test' }; }
      else if (!row) { status = 400; data = { message: 'INVENTORY_RECORD_UNAVAILABLE' }; }
      else { rows[table] = rows[table].filter(item => item !== row); data = { id: row.id }; }
    } else if (u.pathname.includes('/rest/v1/')) {
      const table = u.pathname.split('/').pop()!;
      if (table === 'users') data = [{ id: owner, uid: owner, username: 'tester' }];
      if (table === 'subscriptions') data = [];
      if (rows[table]) {
        const matches = (row: any) => [...u.searchParams].every(([key, val]) => !val.startsWith('eq.') || row[key] === val.slice(3));
        data = rows[table].filter(matches);
        if (['POST', 'PATCH', 'DELETE'].includes(method)) {
          state.writes.push({ table, method, body: req.postDataJSON(), url: u.toString() });
          if (state.fail === `${method}:${table}`) { status = 400; data = { code: '42501', message: 'Write denied for test' }; }
          else if (method === 'POST') {
            const body = req.postDataJSON();
            if (!body.id) { status = 400; data = { code: '23502', message: `null value in column "id" of relation "${table}" violates not-null constraint` }; }
            else { rows[table].push(body); data = [body]; }
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
async function dismissFeedback(page: Page) {
  await page.getByRole('alertdialog').getByRole('button', { name: 'OK', exact: true }).click();
}

test('Bin form sends an ID, retains values on failure, persists edits and reports denied deletion', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/home');
  await page.getByRole('button', { name: en.dashboard.new }).first().click();
  await page.locator('#binNameInput').fill('Audit bin');
  state.fail = 'POST:bins';
  await page.getByRole('dialog').getByRole('button', { name: en.addBin.create }).click();
  await expect(page.locator('#binNameInput')).toHaveValue('Audit bin');
  await expect(page.getByText('Write denied for test', { exact: true })).toBeVisible();
  state.fail = '';
  await page.getByRole('dialog').getByRole('button', { name: en.addBin.create }).click();
  await expect.poll(() => state.rows.bins.length).toBe(1);
  expect(state.rows.bins[0].id).toMatch(/^[0-9a-f-]{36}$/);
  const id = state.rows.bins[0].id;
  await page.goto(`/bin-details/${id}`);
  await page.getByTitle(en.containers.manageContainer).click();
  await page.getByRole('menuitem', { name: en.actions.edit }).click();
  await page.locator('#binName').fill('Edited bin');
  await page.getByRole('dialog').getByRole('button', { name: en.containers.updateBinBtn }).click();
  await expect.poll(() => state.rows.bins[0].name).toBe('Edited bin');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Edited bin', exact: true })).toBeVisible();
  state.fail = 'DELETE:bins';
  await page.getByTitle(en.containers.manageContainer).click();
  await page.getByRole('menu').getByText(en.actions.delete, { exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: /delete/i }).click();
  await expect(page.getByText(/Write denied for test/)).toBeVisible();
  expect(state.rows.bins.length).toBe(1);
  expect(new URL(page.url()).pathname).toBe(`/bin-details/${id}`);
  state.fail = '';
  await page.getByTitle(en.containers.manageContainer).click();
  await page.getByRole('menu').getByText(en.actions.delete, { exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: /delete/i }).click();
  await expect(page).toHaveURL(/\/home$/);
  expect(state.rows.bins.length).toBe(0);
});

test('Items create, edit, reload and delete through the UI', async ({ page }) => {
  const state = await setup(page);
  state.rows.bins.push({ id: 'test-bin', userId: owner, name: 'Test bin', createdAt: timestamp });
  await page.goto('/bin-details/test-bin');
  await page.getByRole('button', { name: en.containers.addItem, exact: true }).first().click();
  await page.locator('#addName').fill('Audit item');
  await page.getByRole('dialog').getByRole('button', { name: en.containers.addItem }).click();
  await expect.poll(() => state.rows.items.length).toBe(1);
  expect(state.rows.items[0].id).toMatch(/^[0-9a-f-]{36}$/);
  await page.getByTitle(en.containers.editItem, { exact: true }).first().click();
  await page.locator('#editName').fill('Edited item');
  await page.getByRole('dialog').getByRole('button', { name: en.containers.updateItemBtn }).click();
  await expect.poll(() => state.rows.items[0].name).toBe('Edited item');
  await page.reload();
  await expect(page.getByText('Edited item', { exact: true }).first()).toBeVisible();
  await page.getByTitle(en.containers.deleteItem, { exact: true }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: /delete/i }).click();
  await expect.poll(() => state.rows.items.length).toBe(0);
});

test('Locations create, edit and delete with owner-scoped requests', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/locations');
  await page.getByRole('button', { name: en.locations.new }).first().click();
  await page.locator('#name').fill('Audit location');
  await page.getByRole('dialog').getByRole('button', { name: en.form.create, exact: true }).click();
  await expect.poll(() => state.rows.locations.length).toBe(1);
  expect(state.rows.locations[0].id).toMatch(/^[0-9a-f-]{36}$/);
  await dismissFeedback(page);
  await page.locator('button[data-slot="dropdown-menu-trigger"]').last().click();
  await page.getByRole('menuitem', { name: en.actions.edit, exact: true }).click();
  await page.locator('#edit-name').fill('Edited location');
  await page.getByRole('dialog').getByRole('button', { name: en.form.update, exact: true }).click();
  await expect.poll(() => state.rows.locations[0].name).toBe('Edited location');
  await page.reload();
  await expect(page.getByText('Edited location', { exact: true })).toBeVisible();
  await page.locator('button[data-slot="dropdown-menu-trigger"]').last().click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('menuitem', { name: en.actions.delete, exact: true }).click();
  await expect.poll(() => state.rows.locations.length).toBe(0);
  for (const write of state.writes.filter(w => w.method === 'RPC_DELETE')) expect(write.body.p_owner).toBe(owner);
  for (const write of state.writes.filter(w => ['PATCH', 'DELETE'].includes(w.method))) expect(new URL(write.url).searchParams.get('userId')).toBe(`eq.${owner}`);
});
