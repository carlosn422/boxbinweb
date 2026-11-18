import { test, expect, type Page } from '@playwright/test';
import { setup, en, owner, timestamp } from './records-fixture';
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
