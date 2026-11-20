import { authenticate, cors, json, readBody, type Context } from './copilot-server.ts';

export class BillingError extends Error {
  constructor(public code: string, public status = 400, public definitive = false) { super(code); }
}
const requireId = (value: unknown, prefix: string) => {
  if (typeof value !== 'string' || !new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value)) throw new BillingError('BILLING_INVALID');
  return value;
};
function encode(value: any, prefix: string, params: URLSearchParams) {
  if (value === undefined || value === null) return;
  if (typeof value === 'object') for (const [key, item] of Object.entries(value)) encode(item, prefix ? `${prefix}[${key}]` : key, params);
  else params.append(prefix, String(value));
}
export async function stripeRequest(path: string, method = 'GET', body: any = {}, key?: string) {
  const secret = Deno.env.get('STRIPE_SECRET_KEY') || Deno.env.get('APIKEY');
  if (!secret) throw new BillingError('BILLING_CONFIGURATION', 503);
  const params = new URLSearchParams(); encode(body, '', params);
  const response = await fetch(`https://api.stripe.com/v1/${path}${method === 'GET' && params.size ? '?' + params : ''}`, {
    method, headers: { Authorization: `Bearer ${secret}`, 'Stripe-Version': '2023-10-16',
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}),
    }, body: method === 'POST' ? params.toString() : undefined, signal: AbortSignal.timeout(25000),
  });
  const data = await response.json();
  if (!response.ok) {
    const rejected = response.status === 400 && data.error?.type === 'invalid_request_error';
    const code = data.error?.type === 'card_error' ? 'BILLING_CARD_DECLINED' : 'BILLING_PROVIDER_ERROR';
    throw new BillingError(code, response.status >= 500 ? 503 : 400, rejected);
  }
  return data;
}
async function dbRpc(ctx: Context, name: string, args: Record<string, unknown>) {
  const { data, error } = await ctx.db.rpc(name, args);
  if (error) { console.error('Billing persistence failed', { operation: name, code: error.code }); throw new BillingError('BILLING_SAVE_FAILED', 503); }
  return data;
}
async function currentSubscription(ctx: Context) {
  const { data, error } = await ctx.db.from('subscriptions').select('*').eq('userId', ctx.owner).limit(2);
  if (error) throw new BillingError('BILLING_LOAD_FAILED', 503);
  if (data?.length > 1) throw new BillingError('BILLING_MULTIPLE_SUBSCRIPTIONS', 409);
  return data?.[0] || null;
}
async function priceById(id: unknown) {
  const price = await stripeRequest(`prices/${requireId(id, 'price')}`, 'GET', { expand: ['product'] });
  if (!price.active || !price.product?.active || price.product.deleted || !Number.isSafeInteger(price.unit_amount) || price.unit_amount < 0) throw new BillingError('BILLING_INVALID_PRICE');
  return price;
}
const planData = (price: any) => ({ id: price.id, priceId: price.id, unit_amount: price.unit_amount, currency: price.currency,
  recurring: price.recurring, metadata: price.product.metadata || {}, product: { id: price.product.id, name: price.product.name, description: price.product.description, metadata: price.product.metadata || {} } });
function tokenCount(price: any) {
  const count = Number(price.product.metadata?.tokens);
  if (price.recurring || !Number.isSafeInteger(count) || count < 1 || count > 100000000) throw new BillingError('BILLING_INVALID_PACKAGE');
  return count;
}
function subscriptionPrice(price: any) {
  if (!price.recurring || (!price.product.metadata?.bins && !price.product.metadata?.items)) throw new BillingError('BILLING_INVALID_PLAN');
}
function subscriptionResult(sub: any) {
  const intent = sub.latest_invoice?.payment_intent;
  return { subscriptionId: sub.id, customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    status: sub.status, planId: sub.items.data[0].price.id, clientSecret: typeof intent === 'object' ? intent?.client_secret : null,
    paymentStatus: typeof intent === 'object' ? intent?.status : null, setupClientSecret: sub.pending_setup_intent?.client_secret || null, appliedCoupon: sub.discount?.coupon || null };
}
export async function saveSubscription(ctx: Context, sub: any, details?: any, expectedPreviousSubscriptionId?: string) {
  const price = sub.items.data[0].price;
  const invoice = typeof sub.latest_invoice === 'object' ? sub.latest_invoice : null;
  const data = { planId: price.id, status: sub.status, stripeSubscriptionId: sub.id,
    stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    paymentMethod: typeof sub.default_payment_method === 'string' ? sub.default_payment_method : null,
    originalPrice: price.unit_amount, finalPrice: invoice?.amount_due ?? price.unit_amount,
    discountAmount: invoice ? Math.max(0, (price.unit_amount || 0) - invoice.amount_due) : 0,
    couponUsed: sub.discount?.coupon || null, billingDetails: details || null, ...(expectedPreviousSubscriptionId ? { expectedPreviousSubscriptionId } : {}) };
  await dbRpc(ctx, 'billing_save_subscription', { p_actor: ctx.actor, p_data: data });
  return subscriptionResult(sub);
}
async function ownedSubscription(ctx: Context, id: unknown) {
  const sub = await stripeRequest(`subscriptions/${requireId(id, 'sub')}`, 'GET', { expand: ['latest_invoice.payment_intent', 'pending_setup_intent'] });
  if (sub.metadata?.actor !== ctx.actor) {
    const local = await currentSubscription(ctx);
    if (!local || local.stripeSubscriptionId !== sub.id) throw new BillingError('BILLING_FORBIDDEN', 403);
  }
  return sub;
}
export async function fulfillTokens(ctx: Context, intent: any) {
  if (intent.metadata?.actor !== ctx.actor || intent.metadata?.purpose !== 'boxbin_tokens') throw new BillingError('BILLING_FORBIDDEN', 403);
  const tokens = Number(intent.metadata.tokens);
  if (intent.status !== 'succeeded' || intent.amount_received !== Number(intent.metadata.amount) || intent.currency !== intent.metadata.currency || !Number.isSafeInteger(tokens) || tokens < 1) throw new BillingError('BILLING_PAYMENT_PENDING', 409);
  return await dbRpc(ctx, 'billing_credit_tokens', { p_actor: ctx.actor, p_receipt: intent.id, p_package: intent.metadata.packageId, p_tokens: tokens });
}
const terminal = (sub: any) => ['canceled', 'incomplete_expired'].includes(sub.status);
const sameOffer = (sub: any, payload: any) => sub.items.data[0].price.id === payload.planId && (sub.discount?.coupon?.id || null) === (payload.couponId || null);

async function replayCheckout(ctx: Context, checkout: any) {
  const payload = checkout.payload;
  // Keep v1 parameters byte-for-byte equivalent for outstanding legacy keys.
  const customer = await stripeRequest('customers', 'POST', { metadata: { actor: ctx.actor, userId: ctx.owner } }, `customer:${checkout.id}`);
  await stripeRequest(`payment_methods/${payload.paymentMethodId}/attach`, 'POST', { customer: customer.id }, `attach:${checkout.id}`);
  return stripeRequest('subscriptions', 'POST', {
    customer: customer.id,
    default_payment_method: payload.paymentMethodId,
    items: [{ price: payload.planId }], payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription', payment_method_types: ['card'] },
    expand: payload.version === 2 ? ['latest_invoice.payment_intent', 'pending_setup_intent'] : ['latest_invoice.payment_intent'], coupon: payload.couponId || undefined,
    metadata: { actor: ctx.actor, userId: ctx.owner },
  }, `subscription:${checkout.id}`);
}

async function recoverExpiredCheckout(ctx: Context, checkout: any) {
  // Do not replay an expired idempotency key. List (not eventual-consistency
  // search) all subscriptions in the original request's time window first.
  const created = Math.floor(Date.parse(checkout.createdAt) / 1000) - 60;
  if (!Number.isFinite(created)) throw new BillingError('BILLING_CHECKOUT_RECOVERY', 409);
  const matches: any[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const result = await stripeRequest('subscriptions', 'GET', { status: 'all', limit: 100, created: { gte: created }, starting_after: cursor });
    matches.push(...result.data.filter((sub: any) => sub.metadata?.actor === ctx.actor && !terminal(sub)));
    if (!result.has_more) {
      if (matches.length > 1) throw new BillingError('BILLING_MULTIPLE_SUBSCRIPTIONS', 409);
      return matches[0] ? ownedSubscription(ctx, matches[0].id) : null;
    }
    cursor = result.data.at(-1)?.id;
  }
  throw new BillingError('BILLING_CHECKOUT_RECOVERY', 409);
}

async function settleExisting(ctx: Context, sub: any, payload: any): Promise<any | null> {
  // Always use the live state: idempotent create responses contain the state
  // at creation, even if the user has paid since then.
  sub = await ownedSubscription(ctx, sub.id);
  if (terminal(sub)) { await saveSubscription(ctx, sub); return null; }
  if (sameOffer(sub, payload)) return saveSubscription(ctx, sub, payload.billingDetails);
  if (sub.status !== 'incomplete') {
    await saveSubscription(ctx, sub);
    throw new BillingError('BILLING_SUBSCRIPTION_EXISTS', 409);
  }
  const invoice = sub.latest_invoice;
  const intent = invoice?.payment_intent;
  if (invoice?.status !== 'open' || !['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(intent?.status)) throw new BillingError('BILLING_PAYMENT_PENDING', 409);
  // Voiding the unpaid invoice invalidates its intent. If payment won the race,
  // Stripe rejects the void; do not create a replacement subscription.
  await stripeRequest(`invoices/${invoice.id}/void`, 'POST', {}, `void:${invoice.id}`);
  sub = await ownedSubscription(ctx, sub.id);
  if (!terminal(sub)) {
    // Some invoice/subscription combinations stay active after a void. Only
    // cancel after verifying that this exact unpaid intent was invalidated.
    if (sub.latest_invoice?.id !== invoice.id || sub.latest_invoice?.status !== 'void' || sub.latest_invoice?.payment_intent?.status !== 'canceled') throw new BillingError('BILLING_PAYMENT_PENDING', 409);
    sub = await stripeRequest(`subscriptions/${sub.id}`, 'DELETE');
  }
  await saveSubscription(ctx, sub);
  return null;
}

async function createSubscription(ctx: Context, body: Record<string, any>) {
  const price = await priceById(body.planId); subscriptionPrice(price);
  if (price.unit_amount === 0) throw new BillingError('BILLING_INVALID_PLAN');
  requireId(body.paymentMethodId, 'pm');
  if (body.couponId) {
    if (typeof body.couponId !== 'string' || body.couponId.length > 100) throw new BillingError('BILLING_INVALID_COUPON');
    const coupon = await stripeRequest(`coupons/${encodeURIComponent(body.couponId)}`);
    if (!coupon.valid || (coupon.currency && coupon.currency !== price.currency) || (coupon.applies_to?.products && !coupon.applies_to.products.includes(price.product.id))) throw new BillingError('BILLING_INVALID_COUPON');
  }
  const payload = { version: 2, paymentMethodId: body.paymentMethodId, planId: price.id, couponId: body.couponId || null, billingDetails: body.billingDetails || {} };
  const local = await currentSubscription(ctx);
  if (local?.stripeSubscriptionId) {
    const result = await settleExisting(ctx, { id: local.stripeSubscriptionId }, payload);
    if (result) return result;
  }
  let checkout = await dbRpc(ctx, 'billing_reserve_checkout', { p_actor: ctx.actor, p_data: payload });
  let sub: any;
  try {
    sub = Date.now() - Date.parse(checkout.createdAt) > 23 * 3600000
      ? await recoverExpiredCheckout(ctx, checkout)
      : await replayCheckout(ctx, checkout);
  } catch (error) {
    // Only an explicit validation rejection proves that creation did not
    // happen. Timeouts and 5xx retain the reservation for exact replay.
    if (!(error instanceof BillingError) || !error.definitive) throw error;
    // Confirm no subscription exists before replacing a legacy failed request.
    sub = await recoverExpiredCheckout(ctx, checkout);
    if (!sub && JSON.stringify(checkout.payload) === JSON.stringify(payload)) throw error;
  }
  if (sub) {
    const result = await settleExisting(ctx, sub, payload);
    if (result) return result;
  }
  checkout = await dbRpc(ctx, 'billing_replace_checkout', { p_actor: ctx.actor, p_previous: checkout.id, p_data: payload });
  sub = await replayCheckout(ctx, checkout);
  return saveSubscription(ctx, sub, payload.billingDetails);
}

export async function billingOperation(ctx: Context, body: Record<string, any>) {
  const op = body.operation;
  if (op === 'plans') {
    const prices: any[] = []; let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const result = await stripeRequest('prices', 'GET', { active: true, limit: 100, expand: ['data.product'], starting_after: cursor });
      prices.push(...result.data.filter((p: any) => p.product?.active && Number.isSafeInteger(p.unit_amount)).map(planData));
      if (!result.has_more) return prices;
      cursor = result.data.at(-1)?.id;
    }
    throw new BillingError('BILLING_TOO_MANY_PLANS', 503);
  }
  if (op === 'validate_coupon') {
    if (typeof body.couponCode !== 'string' || !body.couponCode.trim() || body.couponCode.length > 100) throw new BillingError('BILLING_INVALID');
    const coupon = await stripeRequest(`coupons/${encodeURIComponent(body.couponCode.trim())}`);
    const price = await priceById(body.planId);
    const valid = coupon.valid && (!coupon.currency || coupon.currency === price.currency) && (!coupon.applies_to?.products || coupon.applies_to.products.includes(price.product.id));
    return { valid: Boolean(valid), coupon: valid ? coupon : null };
  }
  if (op === 'activate_free') {
    const price = await priceById(body.planId); subscriptionPrice(price);
    if (price.unit_amount !== 0) throw new BillingError('BILLING_PAYMENT_REQUIRED');
    const existing = await currentSubscription(ctx);
    if (existing?.stripeSubscriptionId && !['canceled','incomplete_expired'].includes(existing.status)) throw new BillingError('BILLING_SUBSCRIPTION_EXISTS', 409);
    return dbRpc(ctx, 'billing_save_subscription', { p_actor: ctx.actor, p_data: { planId: price.id, status: 'active' } });
  }
  if (op === 'create_subscription') {
    const lease = crypto.randomUUID();
    if (!await dbRpc(ctx, 'billing_checkout_lock', { p_actor: ctx.actor, p_lease: lease })) throw new BillingError('BILLING_CHECKOUT_BUSY', 409);
    try { return await createSubscription(ctx, body); }
    finally {
      // An unsuccessful release expires automatically; never hide a payment result.
      try { await dbRpc(ctx, 'billing_checkout_lock', { p_actor: ctx.actor, p_lease: lease, p_release: true }); }
      catch { console.error('Billing checkout lease release failed'); }
    }
  }
  if (op === 'setup_payment_method') {
    const local = await currentSubscription(ctx);
    if (!local?.stripeSubscriptionId) throw new BillingError('BILLING_NOT_FOUND', 404);
    const sub = await ownedSubscription(ctx, local.stripeSubscriptionId);
    if (terminal(sub)) throw new BillingError('BILLING_SUBSCRIPTION_ENDED', 409);
    const setup = await stripeRequest('setup_intents', 'POST', {
      customer: sub.customer, usage: 'off_session', payment_method_types: ['card'],
      metadata: { actor: ctx.actor, subscriptionId: sub.id },
    }, `setup:${ctx.actor}:${requireId(body.requestId, 'req')}`);
    return { clientSecret: setup.client_secret, setupIntentId: setup.id };
  }
  if (op === 'update_payment_method') {
    const setup = await stripeRequest(`setup_intents/${requireId(body.setupIntentId, 'seti')}`);
    const local = await currentSubscription(ctx);
    if (setup.status !== 'succeeded' || setup.metadata?.actor !== ctx.actor || setup.metadata?.subscriptionId !== local?.stripeSubscriptionId) throw new BillingError('BILLING_FORBIDDEN', 403);
    let sub = await ownedSubscription(ctx, local.stripeSubscriptionId);
    if (setup.customer !== sub.customer || terminal(sub)) throw new BillingError('BILLING_FORBIDDEN', 403);
    const method = requireId(setup.payment_method, 'pm');
    await stripeRequest(`subscriptions/${sub.id}`, 'POST', { default_payment_method: method }, `method:${setup.id}`);
    const invoice = sub.latest_invoice;
    if (invoice && ['open', 'uncollectible'].includes(invoice.status)) {
      try {
        await stripeRequest(`invoices/${invoice.id}/pay`, 'POST', { payment_method: method, off_session: false }, `pay:${setup.id}:${invoice.id}`);
      } catch (error) {
        // Authentication/card failures return an intent that the browser can
        // confirm. Transport/persistence failures remain retryable errors.
        if (!(error instanceof BillingError)) throw error;
        const live = await ownedSubscription(ctx, sub.id);
        if (!['requires_action', 'requires_payment_method'].includes(live.latest_invoice?.payment_intent?.status)) throw error;
      }
    }
    sub = await ownedSubscription(ctx, sub.id);
    return { ...await saveSubscription(ctx, sub), paymentMethodId: method };
  }
  if (op === 'sync_subscription') {
    let sub = await ownedSubscription(ctx, body.subscriptionId);
    if (body.setupIntentId) {
      const setup = await stripeRequest(`setup_intents/${requireId(body.setupIntentId, 'seti')}`);
      if (setup.status !== 'succeeded' || setup.customer !== sub.customer || terminal(sub)) throw new BillingError('BILLING_FORBIDDEN', 403);
      await stripeRequest(`subscriptions/${sub.id}`, 'POST', { default_payment_method: requireId(setup.payment_method, 'pm') }, `subscription-setup:${sub.id}:${setup.id}`);
      sub = await ownedSubscription(ctx, sub.id);
    }
    return saveSubscription(ctx, sub);
  }
  if (op === 'cancel_subscription') {
    const existing = await currentSubscription(ctx);
    if (!existing) throw new BillingError('BILLING_NOT_FOUND', 404);
    if (!existing.stripeSubscriptionId) {
      const { error } = await ctx.db.from('subscriptions').delete().eq('id', existing.id).eq('userId', ctx.owner).select('id').single();
      if (error) throw new BillingError('BILLING_SAVE_FAILED', 503);
      return { success: true };
    }
    const current = await ownedSubscription(ctx, existing.stripeSubscriptionId);
    const canceled = current.status === 'canceled' ? current : await stripeRequest(`subscriptions/${current.id}`, 'DELETE');
    await saveSubscription(ctx, canceled); return { success: true };
  }
  if (op === 'upgrade_subscription') {
    const current = await ownedSubscription(ctx, body.subscriptionId);
    const price = await priceById(body.newPriceId); subscriptionPrice(price);
    if (current.items.data[0].price.id === price.id || current.pending_update) return saveSubscription(ctx, current);
    if (!['active','trialing'].includes(current.status) || price.unit_amount <= current.items.data[0].price.unit_amount || price.currency !== current.currency) throw new BillingError('BILLING_INVALID_PLAN');
    const sub = await stripeRequest(`subscriptions/${current.id}`, 'POST', {
      proration_behavior: 'always_invoice', payment_behavior: 'pending_if_incomplete',
      items: [{ id: current.items.data[0].id, price: price.id }], expand: ['latest_invoice.payment_intent'],
    }, `upgrade:${ctx.actor}:${requireId(body.requestId, 'req')}`);
    return saveSubscription(ctx, sub);
  }
  if (op === 'create_token_payment') {
    await dbRpc(ctx, 'billing_token_balance', { p_actor: ctx.actor });
    const price = await priceById(body.packageId), tokens = tokenCount(price);
    if (price.unit_amount <= 0) throw new BillingError('BILLING_INVALID_PACKAGE');
    const intent = await stripeRequest('payment_intents', 'POST', { amount: price.unit_amount, currency: price.currency, payment_method_types: ['card'],
      metadata: { actor: ctx.actor, userId: ctx.owner, purpose: 'boxbin_tokens', packageId: price.id, tokens, amount: price.unit_amount, currency: price.currency },
    }, `tokens:${ctx.actor}:${requireId(body.requestId, 'req')}`);
    return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
  }
  if (op === 'credit_tokens') return fulfillTokens(ctx, await stripeRequest(`payment_intents/${requireId(body.paymentIntentId, 'pi')}`));
  if (op === 'claim_free_tokens') {
    const price = await priceById(body.packageId), tokens = tokenCount(price);
    if (price.unit_amount !== 0) throw new BillingError('BILLING_PAYMENT_REQUIRED');
    return dbRpc(ctx, 'billing_credit_tokens', { p_actor: ctx.actor, p_receipt: `free:${ctx.actor}:${price.id}`, p_package: price.id, p_tokens: tokens });
  }
  throw new BillingError('BILLING_INVALID');
}
export async function billingHandler(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const ctx = await authenticate(req);
    return json(await billingOperation(ctx, await readBody(req)));
  } catch (error) {
    const code = error instanceof BillingError ? error.code : (error as { code?: string })?.code === 'COPILOT_UNAUTHORIZED' ? 'BILLING_UNAUTHORIZED' : 'BILLING_UNAVAILABLE';
    console.error('Billing request failed', { code });
    return json({ code, error: code }, error instanceof BillingError ? error.status : code === 'BILLING_UNAUTHORIZED' ? 401 : 503);
  }
}
