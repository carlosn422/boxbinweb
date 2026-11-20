import { test, expect } from '@playwright/test';
import { setup, en, owner, timestamp } from './records-fixture';
const research = { version: 1, market: 'US', currency: 'USD', query: 'Camera', status: 'found', checkedAt: timestamp,
  offers: [{ marketplace: 'amazon', title: 'Comparable camera', url: 'https://www.amazon.com/dp/B000000001', price: 25, currency: 'USD', condition: 'used', match: 'similar' },
    { marketplace: 'ebay', title: 'Camera market results', url: 'https://www.ebay.com/b/Cameras/625/bn_123', price: 20, currency: 'USD', condition: 'used', match: 'similar', sourceType: 'results' }] };

for (const width of [390, 1440]) test(`Photo references survive save and reload at ${width}px; no price fallback`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const state = await setup(page);
  state.rows.bins.push({ id: 'test-bin', userId: owner, name: 'Test bin', createdAt: timestamp });
  await page.route('**/rpc/app_token_balance', route => route.fulfill({ json: 100000 }));
  await page.route('**/functions/v1/move-image-to-final-images', route => route.fulfill({ json: { newUrl: 'https://fixture.test/saved.png' } }));
  await page.route('**/api/process-images/estimate-tokens', async route => {
    expect(route.request().postDataBuffer()?.toString()).toContain('marketResearch');
    await route.fulfill({ json: { success: true, MY_TOTAL_TOKENS: 100, available_tokens: 100000, tokens_remaining_after: 99900 } });
  });
  await page.route('**/api/process-images', async route => {
    expect(route.request().postDataBuffer()?.toString()).toContain('marketResearch');
    await route.fulfill({ json: { success: true, data: { items: [
      { id: 'found', label: 'Camera', image_url: 'https://fixture.test/photo.png', market_research: research },
      { id: 'unknown', label: 'Unknown item', image_url: 'https://fixture.test/photo.png', estimated_value_usd: 999, market_research: { ...research, status: 'not_found', offers: [] } }
    ] } } });
  });
  await page.goto('/bin-details/test-bin');
  if (width < 768) await page.getByRole('button', { name: en.workspaceDesign.tools, exact: true }).click();
  await page.getByRole('button', { name: en.containers.aiTools }).click();
  await page.getByRole('menuitem', { name: new RegExp(en.containers.scanPhotos) }).click();
  await page.locator('input[type=file]').last().setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
  await page.getByRole('button', { name: en.aiModals.analyzeImages, exact: true }).click();
  await page.getByRole('button', { name: en.aiModals.confirmAndProcess, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('link', { name: /Comparable camera/ })).toHaveAttribute('href', research.offers[0].url);
  await expect(dialog.getByText(en.market.resultsSource)).toBeVisible();
  await expect(dialog.getByText(en.market.not_found, { exact: false }).first()).toBeVisible();
  await expect(dialog.getByText('$999')).toHaveCount(0);
  await expect(dialog.getByText('NaN%')).toHaveCount(0);
  await expect(dialog.getByRole('combobox')).toHaveValue('');
  if (width === 1440) await dialog.getByRole('combobox').selectOption('0');
  await page.screenshot({ path: `test-results/market-preview-${width}.png`, fullPage: true });
  await dialog.getByRole('button', { name: en.aiModals.addToContainer, exact: true }).first().click();
  await expect.poll(() => state.rows.items.length).toBe(1);
  expect(state.rows.items[0].market_research.offers[0].url).toBe(research.offers[0].url);
  expect(state.rows.items[0].value).toBe(width === 1440 ? '25' : '');
  await dialog.getByRole('button', { name: en.aiModals.addToContainer, exact: true }).click();
  await expect.poll(() => state.rows.items.length).toBe(2);
  expect(state.rows.items[1].value).toBe('');
  await page.reload();
  await page.getByText(/Market references · 2/).click();
  await expect(page.getByRole('link', { name: /Comparable camera/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `test-results/market-${width}.png`, fullPage: true });
  if (width < 768) await page.getByRole('button', { name: en.workspaceDesign.sortAndView, exact: true }).click();
  await page.getByTitle(en.containers.listView, { exact: true }).click();
  await page.getByText(/Market references · 2/).click();
  await expect(page.getByRole('link', { name: /Comparable camera/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `test-results/market-list-${width}.png`, fullPage: true });
});
