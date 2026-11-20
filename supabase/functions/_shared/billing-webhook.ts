import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.109.0';
import { fulfillTokens, saveSubscription, stripeRequest } from './billing-server.ts';
import { json, type Context } from './copilot-server.ts';

export async function verifyStripeSignature(body: string, signature: string, secret: string, now = Date.now()) {
  const parts = signature.split(',').map(s => s.split('='));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const bytes = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', bytes.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, bytes.encode(`${timestamp}.${body}`));
  const hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  return parts.some(([name, candidate]) => {
    if (name !== 'v1' || candidate?.length !== hex.length) return false;
    let difference = 0;
    for (let i = 0; i < hex.length; i++) difference |= hex.charCodeAt(i) ^ candidate.charCodeAt(i);
    return difference === 0;
  });
}
export async function billingWebhook(req: Request) {
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) return json({ error: 'BILLING_CONFIGURATION' }, 503);
  const body = await req.text();
  if (body.length > 1000000 || !await verifyStripeSignature(body, req.headers.get('stripe-signature') || '', secret)) return json({ error: 'INVALID_SIGNATURE' }, 400);
  try {
    const event = JSON.parse(body);
    if (!['payment_intent.succeeded', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed', 'invoice.payment_action_required'].includes(event.type)) return json({ received: true });
    let object = event.data.object;
    if (event.type.startsWith('invoice.')) {
      const reference = object.subscription || object.parent?.subscription_details?.subscription;
      const subscriptionId = typeof reference === 'string' ? reference : reference?.id;
      if (!subscriptionId) return json({ received: true });
      object = await stripeRequest(`subscriptions/${encodeURIComponent(subscriptionId)}`, 'GET', { expand: ['latest_invoice.payment_intent'] });
    }
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    let actor = object.metadata?.actor;
    if (!actor && event.type !== 'payment_intent.succeeded') {
      const { data, error } = await db.rpc('billing_actor_for_subscription', { p_subscription: object.id });
      if (error) throw error;
      actor = data;
    }
    if (!actor) return json({ received: true, ignored: 'not_boxbin_checkout' });
    const { data: owner, error } = await db.rpc('copilot_owner', { p_actor: actor });
    if (error) throw error;
    const ctx: Context = { actor, owner: String(owner), db };
    if (event.type === 'payment_intent.succeeded') {
      if (object.metadata?.purpose === 'boxbin_tokens') await fulfillTokens(ctx, object);
    } else {
      const { data: current, error: readError } = await db.from('subscriptions').select('stripeSubscriptionId').eq('userId', ctx.owner).maybeSingle();
      if (readError) throw readError;
      const latest = await stripeRequest(`subscriptions/${encodeURIComponent(object.id)}`, 'GET', { expand: ['latest_invoice.payment_intent'] });
      if (current?.stripeSubscriptionId && current.stripeSubscriptionId !== latest.id) {
        const previous = await stripeRequest(`subscriptions/${encodeURIComponent(current.stripeSubscriptionId)}`);
        // Compare provider chronology, not simply unequal IDs. A newer paid
        // checkout must recover even when the first local save failed.
        if (latest.created < previous.created || (latest.created === previous.created && ['canceled', 'incomplete_expired'].includes(latest.status))) return json({ received: true, ignored: 'previous_subscription' });
        if (!['canceled', 'incomplete_expired'].includes(previous.status)) throw new Error('Conflicting live subscriptions');
        await saveSubscription(ctx, previous, undefined, previous.id);
        await saveSubscription(ctx, latest, undefined, previous.id);
      } else {
        await saveSubscription(ctx, latest);
      }
    }
    return json({ received: true });
  } catch {
    console.error('Billing webhook could not persist event; Stripe should retry');
    return json({ error: 'BILLING_SAVE_FAILED' }, 500);
  }
}
