import { loadStripe } from '@stripe/stripe-js';
import { v4 as uuid } from 'uuid';
import i18n from 'i18next';
import { supabase } from '@/lib/supabase';
import { STRIPE_PUBLISHABLE_KEY } from '@/config/stripe';
export const stripeConfigured = /^pk_(test|live)_/.test(STRIPE_PUBLISHABLE_KEY || '');
export const stripePromise = stripeConfigured ? loadStripe(STRIPE_PUBLISHABLE_KEY).catch(() => null) : Promise.resolve(null);

const billingMessages: Record<string, string> = {
  BILLING_SAVE_FAILED: 'billingRecovery.recoveryPending',
  BILLING_PAYMENT_PENDING: 'records.paymentPending',
  BILLING_CHECKOUT_BUSY: 'billingRecovery.busy',
  BILLING_CHECKOUT_RECOVERY: 'billingRecovery.recoveryPending',
  BILLING_SUBSCRIPTION_EXISTS: 'billingRecovery.subscriptionExists',
  BILLING_SUBSCRIPTION_ENDED: 'billingRecovery.subscriptionEnded',
  BILLING_CARD_DECLINED: 'billingRecovery.cardDeclined',
  BILLING_INVALID_COUPON: 'subscription.checkout.couponInvalid',
  BILLING_CONFIGURATION: 'billingRecovery.unavailable',
};
export function billingErrorMessage(error: unknown): string {
  const e = error as { code?: string; message?: string };
  return e?.code && billingMessages[e.code] ? String(i18n.t(billingMessages[e.code])) : e?.message || String(i18n.t('records.billingFailed'));
}


export async function billingRequest(operation: string, fields: Record<string, unknown> = {}): Promise<any> {
  const { data, error } = await supabase.functions.invoke('boxbin-billing', { body: { ...fields, operation } });
  if (error || data?.error) {
    let code = data?.code;
    if (!code && error && 'context' in error && error.context instanceof Response) {
      try { code = (await error.context.clone().json()).code; } catch { /* Generic localized error below. */ }
    }
    throw Object.assign(new Error(String(i18n.t(billingMessages[code] || 'records.billingFailed'))), { code });
  }
  return data;
}
export const getStripePlans = (): Promise<any[]> => billingRequest('plans');
export const activateFreePlan = (planId: string) => billingRequest('activate_free', { planId });
export const claimFreeTokens = (packageId: string) => billingRequest('claim_free_tokens', { packageId });
export const syncStripeSubscription = (subscriptionId: string, setupIntentId?: string) => billingRequest('sync_subscription', { subscriptionId, setupIntentId });
export const createStripeSubscriptionCupons = (planId: string, couponId: string | undefined, billingDetails: Record<string, string>, paymentMethodId: string) =>
  billingRequest('create_subscription', { planId, couponId, billingDetails, paymentMethodId });

export async function getStripePlanById(priceId: string): Promise<any> {
  if (!priceId) return null;
  const { data, error } = await supabase.functions.invoke('get-plan-by-id', { body: { priceId } });
  if (error || !data?.product) throw new Error(String(i18n.t('subscription.loadError')));
  const metadata = data.product.metadata ?? data.metadata ?? {};
  return { ...data, metadata, product: { ...data.product, metadata } };
}
export const cancelUserSubscription = async (_subscriptionId: string, _userId: string) => billingRequest('cancel_subscription');
export async function upgradeSubscription({ subscriptionId, newPriceId }: { subscriptionId: string; newPriceId: string; userId: string }) {
  let result = await billingRequest('upgrade_subscription', { subscriptionId, newPriceId, requestId: `req_${uuid().replace(/-/g, '')}` });
  if (result.clientSecret && result.paymentStatus !== 'succeeded') {
    const stripe = await stripePromise;
    if (!stripe) throw new Error(String(i18n.t('records.billingFailed')));
    const { error } = await stripe.confirmCardPayment(result.clientSecret);
    if (error) throw error;
  }
  result = await syncStripeSubscription(subscriptionId);
  if (!['active', 'trialing'].includes(result.status) || result.planId !== newPriceId) throw new Error(String(i18n.t('records.paymentPending')));
  return result;
}
export const createStripePaymentIntent = (packageId: string, requestId: string): Promise<{ clientSecret: string; paymentIntentId: string }> =>
  billingRequest('create_token_payment', { packageId, requestId });
export const creditPurchasedTokens = (paymentIntentId: string) => billingRequest('credit_tokens', { paymentIntentId });

export const setupPaymentMethod = (requestId: string) => billingRequest('setup_payment_method', { requestId });
export const updatePaymentMethod = (setupIntentId: string) => billingRequest('update_payment_method', { setupIntentId });
