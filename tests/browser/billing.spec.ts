import { test, expect, type Page } from '@playwright/test';
import { setup, owner, en } from './records-fixture';

async function billingPage(page: Page, status: string | null = 'past_due', configured = true) {
  await setup(page);
  const state = { status, planFailure: false, syncFailure: false, operations: [] as string[] };
  const plan = { id: 'price_A', unit_amount: 1000, currency: 'usd', recurring: { interval: 'month' }, metadata: { bins: '100', items: '100' }, product: { name: 'Starter', metadata: { bins: '100', items: '100' } } };
  if (configured) {
    await page.route('**/src/config/stripe.ts*', route => route.fulfill({ contentType: 'application/javascript', body: 'export const STRIPE_PUBLISHABLE_KEY="pk_test_browserfixture";' }));
  }
  await page.addInitScript(() => {
    const w = window as any;
    w.__stripeCalls = { create: 0, confirm: 0, setup: 0 };
    w.__stripeError = null;
    w.__billingStripe = {
      async createPaymentMethod() { w.__stripeCalls.create++; return { paymentMethod: { id: 'pm_fixture' } }; },
      async confirmCardPayment() {
        w.__stripeCalls.confirm++;
        return w.__stripeError ? { error: { type: 'card_error', message: w.__stripeError } } : { paymentIntent: { id: 'pi_fixture', status: 'succeeded' } };
      },
      async confirmCardSetup() { w.__stripeCalls.setup++; return { setupIntent: { id: 'seti_fixture', status: 'succeeded' } }; },
    };
  });
  await page.route('**/node_modules/.vite/deps/@stripe_stripe-js.js*', route => route.fulfill({ contentType: 'application/javascript', body: 'export const loadStripe=()=>Promise.resolve(window.__billingStripe);' }));
  await page.route('**/node_modules/.vite/deps/@stripe_react-stripe-js.js*', route => route.fulfill({ contentType: 'application/javascript', body: `
    import React from '/node_modules/.vite/deps/react.js';
    export const Elements=({children})=>children;
    export const CardElement=()=>React.createElement('input',{'aria-label':'Test card',className:'w-full border p-3'});
    export const useStripe=()=>window.__billingStripe;
    export const useElements=()=>({getElement:()=>({})});
  ` }));
  await page.route('**/rest/v1/subscriptions*', route => {
    const filter = new URL(route.request().url()).searchParams.get('status');
    const matches = !filter || filter === `eq.${state.status}` || (filter.startsWith('in.') && filter.slice(4, -1).split(',').includes(state.status || ''));
    const sub = state.status && matches ? { id: 'local_sub', userId: owner, status: state.status, planId: 'price_A', stripeSubscriptionId: 'sub_fixture' } : null;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(route.request().headers().accept?.includes('vnd.pgrst.object') ? sub : sub ? [sub] : []) });
  });
  await page.route('**/functions/v1/get-plan-by-id', route => route.fulfill({ status: state.planFailure ? 503 : 200, contentType: 'application/json', body: JSON.stringify(state.planFailure ? { error: 'unavailable' } : plan) }));
  await page.route('**/functions/v1/boxbin-billing', route => {
    const operation = route.request().postDataJSON().operation;
    state.operations.push(operation);
    let data: any;
    let status = 200;
    if (operation === 'plans') data = [plan];
    else if (operation === 'setup_payment_method') data = { setupIntentId: 'seti_fixture', clientSecret: 'setup_secret' };
    else if (operation === 'update_payment_method') { state.status = 'active'; data = { subscriptionId: 'sub_fixture', status: 'active', paymentStatus: 'succeeded' }; }
    else if (operation === 'create_subscription') data = { subscriptionId: 'sub_fixture', status: 'incomplete', paymentStatus: 'requires_payment_method', clientSecret: 'payment_secret' };
    else if (operation === 'sync_subscription') {
      if (state.syncFailure) { status = 503; data = { code: 'BILLING_SAVE_FAILED' }; }
      else { state.status = 'active'; data = { subscriptionId: 'sub_fixture', status: 'active' }; }
    } else throw new Error(`Unexpected billing mutation: ${operation}`);
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  return state;
}

for (const width of [390, 1280]) {
  test(`overdue subscription updates card and pays existing invoice (${width}px)`, async ({ page }, info) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    const state = await billingPage(page);
    await page.goto('/billing/active-subscription');
    await page.getByRole('button', { name: en.billingRecovery.updateCard, exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: en.billingRecovery.updateCard })).toBeVisible();
    await expect(dialog.getByLabel('Test card')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`payment-card-${width}.png`), fullPage: true, animations: 'disabled' });
    await dialog.getByRole('button', { name: en.billingRecovery.saveCard }).click();
    await expect(dialog).not.toBeVisible();
    expect(state.operations).toEqual(['setup_payment_method', 'update_payment_method', 'sync_subscription']);
    expect(errors).toEqual([]);
  });
}

test('failed plan lookup preserves subscription and still permits payment recovery', async ({ page }) => {
  const state = await billingPage(page, 'unpaid'); state.planFailure = true;
  await page.goto('/subscription');
  await expect(page.getByText(en.billingRecovery.planDetailsUnavailable)).toBeVisible();
  await expect(page.getByText(en.billingRecovery.status.unpaid, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: en.billingRecovery.updateCard }).first().click();
  await expect(page.getByRole('dialog').getByLabel('Test card')).toBeVisible();
});

test('expired checkout remains visible with an action to choose a new plan', async ({ page }) => {
  await billingPage(page, 'incomplete_expired');
  await page.goto('/subscription');
  await expect(page.getByText(en.billingRecovery.status.incomplete_expired, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: en.billingRecovery.choosePlan, exact: true }).click();
  await expect(page).toHaveURL(/\/billing$/);
});

test('missing publishable key shows a recoverable message instead of an exception', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await billingPage(page, 'past_due', false);
  // Explicitly emulate missing deployment configuration regardless of runner env.
  await page.route('**/src/config/stripe.ts*', route => route.fulfill({ contentType: 'application/javascript', body: 'export const STRIPE_PUBLISHABLE_KEY=undefined;' }));
  await page.goto('/subscription');
  await page.getByRole('button', { name: en.billingRecovery.updateCard }).first().click();
  await expect(page.getByRole('alert').filter({ hasText: en.billingRecovery.unavailable })).toBeVisible();
  await expect(page.getByRole('button', { name: en.billingRecovery.saveCard })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('a paid checkout retries only synchronization and preserves card-decline messages', async ({ page }) => {
  const state = await billingPage(page, null); state.syncFailure = true;
  // WebView success avoids leaving the checkout while inspecting request counts.
  await page.addInitScript(() => { (window as any).ReactNativeWebView = { postMessage() {} }; });
  await page.goto('/billing');
  await page.getByRole('button', { name: en.subscription.selectPlan, exact: true }).click();
  for (const id of ['firstName', 'lastName', 'address', 'city', 'state', 'zipCode', 'nameOnCard']) await page.locator(`#${id}`).fill(id === 'zipCode' ? '10001' : 'Test');
  await page.evaluate(() => { (window as any).__stripeError = 'Your card was declined.'; });
  await page.locator('button[type=submit]').click();
  await expect(page.getByRole('alert').filter({ hasText: 'Your card was declined.' })).toBeVisible();
  await page.evaluate(() => { (window as any).__stripeError = null; });
  await page.locator('button[type=submit]').click();
  await expect(page.getByRole('alert').filter({ hasText: en.billingRecovery.syncPending })).toBeVisible();
  const before = await page.evaluate(() => ({ ...(window as any).__stripeCalls }));
  const creations = state.operations.filter(op => op === 'create_subscription').length;
  state.syncFailure = false;
  await page.locator('button[type=submit]').click();
  await expect.poll(() => state.operations.filter(op => op === 'sync_subscription').length).toBe(2);
  expect(state.operations.filter(op => op === 'create_subscription')).toHaveLength(creations);
  expect(await page.evaluate(() => (window as any).__stripeCalls)).toEqual(before);
});
