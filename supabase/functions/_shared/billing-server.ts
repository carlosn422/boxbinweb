import { authenticate, cors, json, readBody, type Context } from './copilot-server.ts';

export class BillingError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
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
  if (!response.ok) throw new BillingError('BILLING_PROVIDER_ERROR', response.status >= 500 ? 503 : 400);
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
    paymentStatus: typeof intent === 'object' ? intent?.status : null, appliedCoupon: sub.discount?.coupon || null };
}
export async function saveSubscription(ctx: Context, sub: any, details?: any) {
  const price = sub.items.data[0].price;
  const invoice = typeof sub.latest_invoice === 'object' ? sub.latest_invoice : null;
  const data = { planId: price.id, status: sub.status, stripeSubscriptionId: sub.id,
    stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    paymentMethod: typeof sub.default_payment_method === 'string' ? sub.default_payment_method : null,
    originalPrice: price.unit_amount, finalPrice: invoice?.amount_due ?? price.unit_amount,
    discountAmount: invoice ? Math.max(0, (price.unit_amount || 0) - invoice.amount_due) : 0,
    couponUsed: sub.discount?.coupon || null, billingDetails: details || null };
  await dbRpc(ctx, 'billing_save_subscription', { p_actor: ctx.actor, p_data: data });
  return subscriptionResult(sub);
}
async function ownedSubscription(ctx: Context, id: unknown) {
  const sub = await stripeRequest(`subscriptions/${requireId(id, 'sub')}`, 'GET', { expand: ['latest_invoice.payment_intent'] });
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
    const existing = await currentSubscription(ctx);
    if (existing?.stripeSubscriptionId && !['canceled','incomplete_expired'].includes(existing.status)) {
      if (existing.planId !== body.planId) throw new BillingError('BILLING_SUBSCRIPTION_EXISTS', 409);
      return saveSubscription(ctx, await ownedSubscription(ctx, existing.stripeSubscriptionId), existing.billingDetails);
    }
    const price = await priceById(body.planId); subscriptionPrice(price);
    if (price.unit_amount === 0) throw new BillingError('BILLING_INVALID_PLAN');
    // Persist one checkout per actor before contacting Stripe. Retries or another
    // browser tab resume the same Stripe objects, even if saving the result fails.
    const checkout = await dbRpc(ctx, 'billing_reserve_checkout', { p_actor: ctx.actor, p_data: { planId: price.id, couponId: body.couponId || null, paymentMethodId: requireId(body.paymentMethodId, 'pm'), billingDetails: body.billingDetails || {} } });
    if (Date.now() - Date.parse(checkout.createdAt) > 23 * 3600000) throw new BillingError('BILLING_CHECKOUT_RECOVERY', 409);
    const payload = checkout.payload;
    const customer = await stripeRequest('customers', 'POST', { metadata: { actor: ctx.actor, userId: ctx.owner } }, `customer:${checkout.id}`);
    await stripeRequest(`payment_methods/${payload.paymentMethodId}/attach`, 'POST', { customer: customer.id }, `attach:${checkout.id}`);
    const sub = await stripeRequest('subscriptions', 'POST', { customer: customer.id, default_payment_method: payload.paymentMethodId, items: [{ price: payload.planId }],
      payment_behavior: 'default_incomplete', payment_settings: { save_default_payment_method: 'on_subscription', payment_method_types: ['card'] },
      expand: ['latest_invoice.payment_intent'], coupon: payload.couponId || undefined, metadata: { actor: ctx.actor, userId: ctx.owner },
    }, `subscription:${checkout.id}`);
    return saveSubscription(ctx, sub, payload.billingDetails);
  }
  if (op === 'sync_subscription') return saveSubscription(ctx, await ownedSubscription(ctx, body.subscriptionId));
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
