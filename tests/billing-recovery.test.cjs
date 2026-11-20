const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac, randomUUID } = require('node:crypto');
const { fixture, loadTS, A, B } = require('./helpers/runtime.cjs');

async function harness() {
  const db = await fixture();
  const calls = [], subscriptions = new Map(), responses = new Map();
  let sequence = 0, loseResponse = false;
  const adapter = {
    async rpc(name, args) {
      try {
        const keys = Object.keys(args);
        const result = await db.query(`select ${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(',')}) r`, Object.values(args));
        return { data: result.rows[0].r };
      } catch (error) { return { error: { code: error.code, message: error.message } }; }
    },
    from() {
      const query = { select() { return query; }, eq() { return query; },
        async limit() { return { data: (await db.query('select * from subscriptions where "userId"=$1', [A])).rows }; },
        async maybeSingle() { return { data: (await query.limit()).data[0] || null }; },
      };
      return query;
    },
  };
  const newSub = (id, status = 'incomplete', created = Math.floor(Date.now() / 1000)) => ({
    id, status, created, customer: 'cus_test', currency: 'usd', metadata: { actor: A, userId: A },
    default_payment_method: 'pm_old', items: { data: [{ id: 'si_test', price: { id: 'price_A', unit_amount: 1000 } }] },
    latest_invoice: { id: `in_${id}`, status: status === 'active' ? 'paid' : 'open', amount_due: 1000,
      payment_intent: { id: `pi_${id}`, status: status === 'active' ? 'succeeded' : 'requires_payment_method', client_secret: 'secret' } },
  });
  const fetch = async (url, options = {}) => {
    const u = new URL(url), path = u.pathname.replace('/v1/', ''), method = options.method || 'GET';
    const body = new URLSearchParams(options.body);
    calls.push({ path, method, body, key: options.headers?.['Idempotency-Key'] });
    const key = options.headers?.['Idempotency-Key'];
    if (method === 'POST' && responses.has(key)) return Response.json(responses.get(key));
    let result;
    if (path.startsWith('prices/')) result = { id: path.split('/')[1], active: true, unit_amount: 1000, currency: 'usd', recurring: { interval: 'month' }, product: { id: 'prod_test', active: true, metadata: { bins: '100' } } };
    else if (path.startsWith('coupons/')) result = { id: path.split('/')[1], valid: true };
    else if (path === 'customers') result = { id: 'cus_test' };
    else if (path.startsWith('payment_methods/')) {
      if (path.includes('pm_bad')) return Response.json({ error: { type: 'invalid_request_error' } }, { status: 400 });
      result = { id: path.split('/')[1] };
    } else if (path === 'subscriptions' && method === 'GET') result = { data: [...subscriptions.values()].filter(sub => sub.created >= Number(u.searchParams.get('created[gte]'))), has_more: false };
    else if (path === 'subscriptions') {
      if (body.get('coupon') === 'expired') return Response.json({ error: { type: 'invalid_request_error' } }, { status: 400 });
      result = newSub(`sub_new${++sequence}`);
      result.items.data[0].price.id = body.get('items[0][price]');
      result.default_payment_method = body.get('default_payment_method');
      if (body.get('coupon')) result.discount = { coupon: { id: body.get('coupon') } };
      subscriptions.set(result.id, result);
    } else if (path.startsWith('subscriptions/')) {
      result = subscriptions.get(path.split('/')[1]);
      assert.ok(result, `Unknown subscription ${path}`);
      if (method === 'POST') result.default_payment_method = body.get('default_payment_method');
      if (method === 'DELETE') result.status = 'canceled';
    } else if (path.startsWith('invoices/')) {
      const sub = [...subscriptions.values()].find(s => s.latest_invoice.id === path.split('/')[1]);
      assert.ok(sub);
      if (path.endsWith('/void')) {
        if (sub.latest_invoice.status !== 'open' || sub.latest_invoice.payment_intent.status === 'succeeded') return Response.json({ error: { type: 'invalid_request_error' } }, { status: 400 });
        sub.status = 'incomplete_expired'; sub.latest_invoice.status = 'void'; sub.latest_invoice.payment_intent.status = 'canceled';
      } else if (path.endsWith('/pay')) {
        sub.status = 'active'; sub.latest_invoice.status = 'paid'; sub.latest_invoice.payment_intent.status = 'succeeded';
      }
      result = sub.latest_invoice;
    } else if (path === 'setup_intents') result = { id: 'seti_test', client_secret: 'setup_secret' };
    else if (path === 'setup_intents/seti_test') result = { id: 'seti_test', status: 'succeeded', customer: 'cus_test', payment_method: 'pm_new', metadata: { actor: A, subscriptionId: 'sub_existing' } };
    else throw new Error(`Unexpected Stripe request: ${method} ${path}`);
    if (method === 'POST') responses.set(key, structuredClone(result));
    if (path === 'subscriptions' && method === 'POST' && loseResponse) { loseResponse = false; throw new Error('Network response lost after Stripe created subscription'); }
    return Response.json(result);
  };
  const replacements = { 'https://esm.sh/@supabase/supabase-js@2.109.0': { createClient: () => adapter } };
  const globals = { fetch, Deno: { env: { get: () => 'whsec_test' }, serve() {} } };
  const api = loadTS('supabase/functions/_shared/billing-server.ts', replacements, globals);
  const webhook = loadTS('supabase/functions/_shared/billing-webhook.ts', replacements, globals).billingWebhook;
  const ctx = { actor: A, owner: A, db: adapter };
  const create = (fields = {}) => api.billingOperation(ctx, { operation: 'create_subscription', planId: 'price_A', paymentMethodId: 'pm_new', ...fields });
  const reserve = payload => db.query('select billing_reserve_checkout($1,$2) r', [A, payload]);
  const save = data => db.query('select billing_save_subscription($1,$2)', [A, data]);
  async function event(sub, type = 'customer.subscription.updated') {
    const body = JSON.stringify({ type, data: { object: sub } });
    const time = Math.floor(Date.now() / 1000), digest = createHmac('sha256', 'whsec_test').update(`${time}.${body}`).digest('hex');
    return webhook(new Request('https://test', { method: 'POST', body, headers: { 'stripe-signature': `t=${time},v1=${digest}` } }));
  }
  return { db, api, ctx, calls, subscriptions, newSub, create, reserve, save, event, loseResponse() { loseResponse = true; } };
}

test('checkout lease excludes simultaneous requests, releases by owner token and is server-only', async () => {
  const h = await harness();
  try {
    const one = randomUUID(), two = randomUUID();
    const lock = async (lease, release = false) => (await h.db.query('select billing_checkout_lock($1,$2,$3) r', [A, lease, release])).rows[0].r;
    assert.equal(await lock(one), true);
    assert.equal(await lock(two), false);
    await lock(two, true);
    assert.equal(await lock(two), false);
    await lock(one, true);
    assert.equal(await lock(two), true);
    await assert.rejects(h.create, /BILLING_CHECKOUT_BUSY/);
    assert.equal(h.calls.length, 0);
    await h.db.exec(`set role authenticated;set request.jwt.claim.sub='${A}'`);
    await assert.rejects(() => lock(one), /permission denied/);
  } finally { await h.db.close(); }
});

test('legacy failed checkout accepts corrected card, coupon and plan without replaying a charge', async () => {
  const h = await harness();
  try {
    await h.reserve({ planId: 'price_old', paymentMethodId: 'pm_bad', couponId: 'expired' });
    const result = await h.create({ planId: 'price_B' });
    assert.equal(result.planId, 'price_B');
    assert.equal(h.subscriptions.size, 1);
    assert.equal([...h.subscriptions.values()][0].default_payment_method, 'pm_new');
    assert.equal((await h.db.query('select count(*) n from billing_checkout_locks')).rows[0].n, 0);
  } finally { await h.db.close(); }
});

test('an expired empty reservation starts a fresh checkout after checking Stripe', async () => {
  const h = await harness();
  try {
    const old = (await h.reserve({ planId: 'price_A', paymentMethodId: 'pm_old' })).rows[0].r.id;
    await h.db.exec("update billing_subscription_checkouts set created_at=now()-interval '25 hours'");
    const result = await h.create();
    assert.equal(result.status, 'incomplete');
    assert.equal(h.subscriptions.size, 1);
    assert.ok(h.calls.some(c => c.path === 'subscriptions' && c.method === 'GET'));
    assert.ok(!h.calls.some(c => c.key === `subscription:${old}`));
  } finally { await h.db.close(); }
});

test('an invalid legacy coupon can be removed without keeping its failing reservation', async () => {
  const h = await harness();
  try {
    await h.reserve({ planId: 'price_A', paymentMethodId: 'pm_old', couponId: 'expired' });
    assert.equal((await h.create()).status, 'incomplete');
    assert.equal(h.subscriptions.size, 1);
    assert.equal(h.calls.filter(c => c.path === 'subscriptions' && c.method === 'POST').at(-1).body.get('coupon'), null);
  } finally { await h.db.close(); }
});

test('payment processing cannot be voided to switch plans', async () => {
  const h = await harness();
  try {
    const result = await h.create();
    h.subscriptions.get(result.subscriptionId).latest_invoice.payment_intent.status = 'processing';
    await assert.rejects(() => h.create({ planId: 'price_B' }), /BILLING_PAYMENT_PENDING/);
    assert.equal(h.subscriptions.size, 1);
    assert.equal(h.calls.filter(c => c.path.endsWith('/void')).length, 0);
  } finally { await h.db.close(); }
});

test('a canceled local subscription does not erase a newer uncertain checkout', async () => {
  const h = await harness();
  try {
    const old = h.newSub('sub_old', 'canceled', 100); h.subscriptions.set(old.id, old);
    await h.save({ planId: 'price_A', status: 'canceled', stripeSubscriptionId: old.id });
    h.loseResponse(); await assert.rejects(h.create);
    const result = await h.create();
    assert.notEqual(result.subscriptionId, old.id);
    assert.equal(h.subscriptions.size, 2);
  } finally { await h.db.close(); }
});

test('lost Stripe response resumes the same subscription, including after 24 hours', async () => {
  const h = await harness();
  try {
    h.loseResponse();
    await assert.rejects(h.create, /Network response lost/);
    assert.equal(h.subscriptions.size, 1);
    await h.db.exec("update billing_subscription_checkouts set created_at=now()-interval '25 hours'");
    const result = await h.create();
    assert.equal(result.subscriptionId, [...h.subscriptions.keys()][0]);
    assert.equal(h.calls.filter(c => c.path === 'subscriptions' && c.method === 'POST').length, 1);
  } finally { await h.db.close(); }
});

test('changing offer voids only the unpaid first invoice before replacing checkout', async () => {
  const h = await harness();
  try {
    const first = await h.create();
    const second = await h.create({ planId: 'price_B' });
    assert.notEqual(second.subscriptionId, first.subscriptionId);
    assert.equal(h.subscriptions.get(first.subscriptionId).status, 'incomplete_expired');
    assert.equal(second.planId, 'price_B');
    const live = h.subscriptions.get(second.subscriptionId);
    live.status = 'active'; live.latest_invoice.status = 'paid'; live.latest_invoice.payment_intent.status = 'succeeded';
    await assert.rejects(() => h.create({ planId: 'price_C' }), /BILLING_SUBSCRIPTION_EXISTS/);
    assert.equal(h.subscriptions.size, 2);
  } finally { await h.db.close(); }
});

test('retry after payment uses live state instead of stale idempotency response', async () => {
  const h = await harness();
  try {
    h.loseResponse(); await assert.rejects(h.create);
    const sub = [...h.subscriptions.values()][0]; sub.status = 'active'; sub.latest_invoice.payment_intent.status = 'succeeded';
    const result = await h.create();
    assert.equal(result.status, 'active');
    assert.equal(result.paymentStatus, 'succeeded');
    assert.equal(h.subscriptions.size, 1);
  } finally { await h.db.close(); }
});

test('webhook restores newer subscription after failed save and ignores late older events', async () => {
  const h = await harness();
  try {
    const old = h.newSub('sub_old', 'canceled', 100), newer = h.newSub('sub_new', 'active', 200);
    h.subscriptions.set(old.id, old); h.subscriptions.set(newer.id, newer);
    await h.save({ planId: 'price_A', status: 'canceled', stripeSubscriptionId: old.id });
    assert.equal((await h.event(newer)).status, 200);
    assert.equal((await h.db.query('select "stripeSubscriptionId" id from subscriptions')).rows[0].id, newer.id);
    assert.equal((await (await h.event(old)).json()).ignored, 'previous_subscription');
    // Chronology still protects a newer subscription after it is canceled.
    newer.status = 'canceled'; await h.event(newer);
    assert.equal((await (await h.event(old)).json()).ignored, 'previous_subscription');
    assert.equal((await h.db.query('select "stripeSubscriptionId" id from subscriptions')).rows[0].id, newer.id);
  } finally { await h.db.close(); }
});

test('webhook retries conflicting live subscriptions instead of acknowledging a lost update', async () => {
  const h = await harness();
  try {
    const old = h.newSub('sub_old', 'active', 100), newer = h.newSub('sub_new', 'active', 200);
    h.subscriptions.set(old.id, old); h.subscriptions.set(newer.id, newer);
    await h.save({ planId: 'price_A', status: 'active', stripeSubscriptionId: old.id });
    assert.equal((await h.event(newer)).status, 500);
    await assert.rejects(() => h.save({ planId: 'price_A', status: 'active', stripeSubscriptionId: newer.id, expectedPreviousSubscriptionId: 'sub_wrong' }), /BILLING_SUBSCRIPTION_CONFLICT/);
  } finally { await h.db.close(); }
});

test('new card resolves the existing outstanding invoice without creating another subscription', async () => {
  const h = await harness();
  try {
    const sub = h.newSub('sub_existing', 'past_due'); h.subscriptions.set(sub.id, sub);
    await h.save({ planId: 'price_A', status: 'past_due', stripeSubscriptionId: sub.id });
    const setup = await h.api.billingOperation(h.ctx, { operation: 'setup_payment_method', requestId: 'req_test' });
    assert.equal(setup.setupIntentId, 'seti_test');
    assert.equal(h.calls.at(-1).body.get('customer'), sub.customer);
    assert.equal(h.calls.at(-1).body.get('usage'), 'off_session');
    const result = await h.api.billingOperation(h.ctx, { operation: 'update_payment_method', setupIntentId: setup.setupIntentId });
    assert.equal(result.status, 'active');
    assert.equal(sub.default_payment_method, 'pm_new');
    assert.equal(h.subscriptions.size, 1);
    await h.api.billingOperation(h.ctx, { operation: 'update_payment_method', setupIntentId: setup.setupIntentId });
    assert.equal(h.calls.filter(c => c.path.endsWith('/pay')).length, 1);
    await assert.rejects(() => h.api.billingOperation({ ...h.ctx, actor: B }, { operation: 'update_payment_method', setupIntentId: setup.setupIntentId }), /BILLING_FORBIDDEN/);
    assert.equal((await h.event({ subscription: sub.id }, 'invoice.paid')).status, 200);
  } finally { await h.db.close(); }
});
