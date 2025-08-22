import { loadStripe, type StripeConstructor } from "@stripe/stripe-js";
import Stripe from "stripe";
import { getFunctions, httpsCallable } from "firebase/functions";

declare global {
  interface Window {
    Stripe?: StripeConstructor;
  }
}

interface StripeProduct {
  id: string;
  name: string;
  description?: string;
  default_price?: {
    id: string;
    unit_amount: number;
    recurring: {
      interval: string;
    };
  };
  metadata: any;
}

interface Plan {
  id: string;
  product: {
    name: string;
    description?: string;
  };
  unit_amount: number;
  recurring: {
    interval: string;
  };
  metadata: any;
}

import { STRIPE_PUBLISHABLE_KEY } from "../config/stripe";

export const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
import { STRIPE_SECRET_KEY } from "../config/stripe";

const stripeClient = new Stripe(
   STRIPE_SECRET_KEY,
  {
    apiVersion: "2025-06-30.basil" as const,
  }
);

export const getStripePlans = async (): Promise<Plan[]> => {
  try {
    // Fetch active products with their prices from Stripe
    const { data: products } = (await stripeClient.products.list({
      active: true,
      expand: ["data.default_price"],
    })) as { data: StripeProduct[] };

    return products.map((product: StripeProduct) => ({
      id: product.default_price?.id || "",
      product: {
        name: product.name,
        description: product.description,
      },
      unit_amount: product.default_price?.unit_amount || 0,
      recurring: product.default_price?.recurring || { interval: "month" },
      metadata: product?.metadata,
    }));
  } catch (error) {
    console.error("Error fetching Stripe plans:", error);
    throw error;
  }
};

export const createStripeSubscription = async (
  paymentMethodId: string,
  planId: string,
  customerId?: string,
  userEmail?: string,
  userName?: string,
  userId?: string,
  billingDetails?: {
    firstName: string;
    lastName: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    nameOnCard: string;
  }
) => {
  try {
    let customer;

    if (customerId) {
      customer = await stripeClient.customers.update(customerId, {
        metadata: {
          userId: userId || "",
        },
      });
    } else {
      // Create customer first
      customer = await stripeClient.customers.create({
        email: userEmail || undefined,
        name: billingDetails?.nameOnCard || userName,
        metadata: {
          userId: userId || "",
          name: `${billingDetails?.firstName} ${billingDetails?.lastName}`,
        },
        address: billingDetails
          ? {
              line1: billingDetails.address,
              city: billingDetails.city,
              state: billingDetails.state,
              postal_code: billingDetails.zipCode,
              country: "US",
            }
          : undefined,
      });

      // Then attach the payment method to the customer
      if (paymentMethodId) {
        await stripeClient.paymentMethods.attach(paymentMethodId, {
          customer: customer.id,
        });

        // Set it as the default payment method
        await stripeClient.customers.update(customer.id, {
          invoice_settings: {
            default_payment_method: paymentMethodId,
          },
        });
      }
    }

    /*const subscription = await stripeClient.subscriptions.create({
      customer: customer.id,
      items: [{ price: planId }],
      expand: ['latest_invoice.payment_intent'],
      default_payment_method: paymentMethodId,
    });*/

    //const trialDays = planId === 'price_1RmGukFRvBExIzdOuM8cy2uE' ? 30 : 0;

    const subscription = await stripeClient.subscriptions.create({
      customer: customer.id,
      items: [{ price: planId }],
      expand: ["latest_invoice.payment_intent"],
      default_payment_method: paymentMethodId,
      //trial_period_days: trialDays > 0 ? trialDays : undefined,
    });

    return {
      status: subscription.status,
      subscriptionId: subscription.id,
      customerId: customer.id,
      latestInvoice: subscription.latest_invoice,
    };
  } catch (error) {
    console.error("Error creating subscription:", error);
    throw error;
  }
};

export const createStripeSubscriptionCupons = async (
  paymentMethodId: string,
  planId: string,
  couponId?: string, // Nuevo parámetro para el cupón
  customerId?: string,
  userEmail?: string,
  userName?: string,
  userId?: string,
  billingDetails?: {
    firstName: string;
    lastName: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    nameOnCard: string;
  }
) => {
  try {
    let customer;

    if (customerId) {
      customer = await stripeClient.customers.update(customerId, {
        metadata: {
          userId: userId || "",
        },
      });
    } else {
      // Create customer first
      customer = await stripeClient.customers.create({
        email: userEmail || undefined,
        name: billingDetails?.nameOnCard || userName,
        metadata: {
          userId: userId || "",
          name: `${billingDetails?.firstName} ${billingDetails?.lastName}`,
        },
        address: billingDetails
          ? {
              line1: billingDetails.address,
              city: billingDetails.city,
              state: billingDetails.state,
              postal_code: billingDetails.zipCode,
              country: "US",
            }
          : undefined,
      });

      // Then attach the payment method to the customer
      if (paymentMethodId) {
        await stripeClient.paymentMethods.attach(paymentMethodId, {
          customer: customer.id,
        });

        // Set it as the default payment method
        await stripeClient.customers.update(customer.id, {
          invoice_settings: {
            default_payment_method: paymentMethodId,
          },
        });
      }
    }

    // Preparar parámetros de la suscripción
    const subscriptionParams: any = {
      customer: customer.id,
      items: [{ price: planId }],
      expand: ["latest_invoice.payment_intent"],
      default_payment_method: paymentMethodId,
      metadata: {
        userId: userId || "",
        planId: planId,
      },
    };

    // Agregar cupón si está presente
    if (couponId) {
      subscriptionParams.coupon = couponId;

      // Opcional: Agregar información del cupón a metadata para tracking
      try {
        const coupon = await stripeClient.coupons.retrieve(couponId);
        subscriptionParams.metadata.coupon_used = couponId;
        subscriptionParams.metadata.coupon_discount = coupon.percent_off
          ? `${coupon.percent_off}%`
          : `$${(coupon.amount_off || 0) / 100}`;
        subscriptionParams.metadata.coupon_name = coupon.name || couponId;
      } catch (couponError) {
        console.warn(
          `Could not retrieve coupon details for ${couponId}:`,
          couponError
        );
        // Continuar sin metadata del cupón si hay error
      }
    }

    // Lógica de trial period (mantener tu lógica existente si la necesitas)
    // const trialDays = planId === 'price_1RmGukFRvBExIzdOuM8cy2uE' ? 30 : 0;
    // if (trialDays > 0) {
    //   subscriptionParams.trial_period_days = trialDays;
    // }

    // Crear la suscripción con todos los parámetros
    const subscription: any = await stripeClient.subscriptions.create(
      subscriptionParams
    );

    // Preparar información del cupón aplicado para la respuesta
    let appliedCoupon = null;
    if (couponId && subscription?.discount) {
      appliedCoupon = {
        id: subscription.discount.coupon.id,
        percent_off: subscription.discount.coupon.percent_off,
        amount_off: subscription.discount.coupon.amount_off,
        currency: subscription.discount.coupon.currency,
        name: subscription.discount.coupon.name,
        duration: subscription.discount.coupon.duration,
        duration_in_months: subscription.discount.coupon.duration_in_months,
      };
    }

    return {
      status: subscription.status,
      subscriptionId: subscription.id,
      customerId: customer.id,
      latestInvoice: subscription.latest_invoice,
      appliedCoupon: appliedCoupon,
    };
  } catch (error: any) {
    console.error("Error creating subscription:", error);

    // Manejar errores específicos de cupones
    if (error.code === "coupon_expired") {
      throw new Error("El cupón ha expirado");
    }

    if (error.code === "resource_missing" && error.param === "coupon") {
      throw new Error("El cupón no es válido o no existe");
    }

    if (error.code === "coupon_not_valid") {
      throw new Error("El cupón no es válido para esta suscripción");
    }

    throw error;
  }
};

export const getStripePlanById = async (priceId: string): Promise<any> => {
  try {
    const price = await stripeClient.prices.retrieve(priceId, {
      expand: ["product"],
    });

    if (!price || typeof price.product !== "object") {
      return null;
    }

    const product = price.product as Stripe.Product;

    return {
      priceId: price.id,
      product: {
        name: product.name,
        description: product.description,
      },
      unit_amount: price.unit_amount ?? 0,
      recurring: price.recurring ?? null,
      ...product,
    };
  } catch (error) {
    console.error(`Error retrieving plan with ID ${priceId}:`, error);
    return null;
  }
};

export const cancelUserSubscription = async (
  subscriptionId: string,
  userId: string
) => {
  const functions = getFunctions();
  const cancelSub = httpsCallable(functions, "cancelSubscription");

  const result = await cancelSub({ subscriptionId, userId });
  return result.data;
};

export const upgradeSubscription = async ({
  subscriptionId,
  newPriceId,
  userId,
}: {
  subscriptionId: string;
  newPriceId: string;
  userId: string;
}) => {
  const functions = getFunctions();
  const fn = httpsCallable(functions, "upgradeSubscription");
  const result = await fn({ subscriptionId, newPriceId, userId });
  return result.data;
};

export async function createStripePaymentIntent(
  amount: number,
  currency: string = "usd",
  email?: string,
  name?: string
): Promise<{ clientSecret: string }> {
  const paymentIntent = await stripeClient.paymentIntents.create({
    amount,
    currency,
    receipt_email: email,
    description: `One-time purchase by ${name || email || "Unknown"}`,
    automatic_payment_methods: { enabled: true },
  });

  return { clientSecret: paymentIntent.client_secret! };
}