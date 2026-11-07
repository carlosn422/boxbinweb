import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { createStripeSubscriptionCupons } from '@/lib/stripe';

type CheckoutFormProps = {
  userId: string | undefined;
  planId: string;
  originalPrice: number; // Price in cents (e.g., 2999 for $29.99)
  currency?: string; // Default to 'usd'
};

interface CouponValidation {
  valid: boolean;
  coupon?: {
    id: string;
    percent_off?: number;
    amount_off?: number;
    currency?: string;
    name?: string;
    duration: string;
  };
  error?: string;
}

export default function CheckoutForm({ userId, planId, originalPrice, currency = 'usd' }: CheckoutFormProps) {
  const { t, i18n } = useTranslation();
  const stripe = useStripe();
  const elements = useElements();
  const { currentUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [nameOnCard, setNameOnCard] = useState('');
  
  // Coupon states
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<CouponValidation | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  // Calculate final price with coupon discount
  const finalPrice = useMemo(() => {
    if (!appliedCoupon?.coupon) return originalPrice;
    
    const coupon = appliedCoupon.coupon;
    let discount = 0;
    
    if (coupon.percent_off) {
      discount = Math.round((originalPrice * coupon.percent_off) / 100);
    } else if (coupon.amount_off) {
      discount = coupon.amount_off;
    }
    
    return Math.max(0, originalPrice - discount);
  }, [originalPrice, appliedCoupon]);

  const discountAmount = originalPrice - finalPrice;

  // Format price for display
  const formatPrice = (priceInCents: number) => {
    return new Intl.NumberFormat(i18n.resolvedLanguage, { style: "currency", currency }).format(priceInCents / 100);
  };

  // Validate the coupon through the Supabase Edge Function.
  const validateCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponError('subscription.checkout.couponRequired');
      return;
    }

    setCouponLoading(true);
    setCouponError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('validate-coupon', {
        body: {
          couponCode: couponCode.trim(),
          planId,
          userId,
        },
      });

      if (fnError) throw fnError;

      const couponRes = data as CouponValidation;

      if (couponRes?.valid && couponRes?.coupon) {
        setAppliedCoupon(couponRes);
        setCouponError(null);
      } else {
        setCouponError('subscription.checkout.couponInvalid');
        setAppliedCoupon(null);
      }
    } catch (err: any) {
      console.error('Error validating coupon:', err);
      setCouponError('subscription.checkout.couponError');
      setAppliedCoupon(null);
    } finally {
      setCouponLoading(false);
    }
  };

  // Function to remove coupon
  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponError(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements || !userId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: stripeError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: elements.getElement(CardElement)!,
        billing_details: {
          name: nameOnCard,
          email: currentUser?.email,
          address: {
            line1: address,
            city: city,
            state: state,
            postal_code: zipCode,
            country: 'US'
          }
        }
      });

      if (stripeError) {
        setError(stripeError.message || 'subscription.checkout.paymentFailed');
        return;
      }

      // Get user information
      const userEmail = currentUser?.email;
      const userName = currentUser?.displayName;

      // Create Stripe subscription with coupon using your local function
      const { subscriptionId, customerId, appliedCoupon: finalAppliedCoupon } = await createStripeSubscriptionCupons(
        paymentMethod.id,
        planId,
        appliedCoupon?.coupon?.id, // Pass coupon ID as third parameter
        undefined, // customerId
        userEmail || undefined,
        userName || undefined,
        currentUser?.uid ?? "",
        {
          firstName,
          lastName,
          address,
          city,
          state,
          zipCode,
          nameOnCard
        }
      );

      await supabase.from("subscriptions").delete().eq("userId", userId);

      await supabase.from("subscriptions").insert({
        userId,
        planId,
        status: 'active',
        paymentMethod: paymentMethod.id,
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId: customerId,
        couponUsed: finalAppliedCoupon || appliedCoupon?.coupon || null,
        originalPrice,
        finalPrice,
        discountAmount,
        billingDetails: {
          firstName,
          lastName,
          address,
          city,
          state,
          zipCode,
          nameOnCard
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      if ((window as any).ReactNativeWebView) {
        (window as any).ReactNativeWebView.postMessage(JSON.stringify({
          type: 'SUBSCRIPTION_SUCCESS',
        }));
      } else {
        window.location.href = '/home';
      }
    } catch (err) {
      setError('subscription.checkout.unexpectedError');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="min-w-0 space-y-6 break-words">
      {/* Personal information fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="min-w-0 space-y-2">
          <Label htmlFor="firstName">{t("subscription.checkout.firstName")}</Label>
          <Input
            id="firstName"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="lastName">{t("subscription.checkout.lastName")}</Label>
          <Input
            id="lastName"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="min-w-0 space-y-2">
        <Label htmlFor="address">{t("subscription.checkout.address")}</Label>
        <Input
          id="address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="min-w-0 space-y-2">
          <Label htmlFor="city">{t("subscription.checkout.city")}</Label>
          <Input
            id="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            required
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="state">{t("subscription.checkout.state")}</Label>
          <Input
            id="state"
            value={state}
            onChange={(e) => setState(e.target.value)}
            required
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="zipCode">{t("subscription.checkout.zipCode")}</Label>
          <Input
            id="zipCode"
            value={zipCode}
            onChange={(e) => setZipCode(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="min-w-0 space-y-2">
        <Label htmlFor="nameOnCard">{t("subscription.checkout.nameOnCard")}</Label>
        <Input
          id="nameOnCard"
          value={nameOnCard}
          onChange={(e) => setNameOnCard(e.target.value)}
          required
        />
      </div>

      {/* Coupon section */}
      <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
        <Label htmlFor="couponCode" className="text-base font-semibold">{t("subscription.checkout.discountCode")}</Label>
        
        {!appliedCoupon ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="couponCode"
              placeholder={t("subscription.checkout.couponPlaceholder")}
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              className="min-w-0 flex-1"
            />
            <Button
              type="button"
              variant="outline"
              onClick={validateCoupon}
              disabled={couponLoading || !couponCode.trim()}
            >
              {couponLoading ? t("subscription.checkout.validating") : t("subscription.checkout.apply")}
            </Button>
          </div>
        ) : (
          <div className="p-3 bg-green-50 border border-green-200 rounded-md">
            <div className="flex flex-wrap gap-2 justify-between items-start">
              <div>
                <p className="font-medium text-green-800">
                  {t("subscription.checkout.couponApplied", { name: appliedCoupon.coupon?.name || couponCode })}
                </p>
                <p className="text-sm text-green-600">
                  {t("subscription.checkout.discount")} {
                    appliedCoupon.coupon?.percent_off 
                      ? `${appliedCoupon.coupon.percent_off}%`
                      : appliedCoupon.coupon?.amount_off 
                        ? `$${(appliedCoupon.coupon.amount_off / 100).toFixed(2)} ${appliedCoupon.coupon.currency?.toUpperCase()}`
                        : t("subscription.checkout.applied")
                  }
                </p>
                <p className="text-xs text-gray-600">
                  {t("subscription.checkout.duration")} {t(`subscription.checkout.${appliedCoupon.coupon?.duration === "once" ? "once" : appliedCoupon.coupon?.duration === "forever" ? "forever" : "limited"}`)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={removeCoupon}
                className="text-red-600 hover:text-red-800"
              >
                {t("subscription.checkout.remove")}
              </Button>
            </div>
          </div>
        )}

        {couponError && (
          <p className="text-red-500 text-sm">❌ {t(couponError)}</p>
        )}
      </div>

      {/* Price summary */}
      <div className="p-4 border rounded-lg bg-brand-50">
        <h3 className="font-semibold text-lg mb-3">{t("subscription.checkout.summary")}</h3>
        
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap gap-2 justify-between">
            <span>{t("subscription.checkout.planPrice")}</span>
            <span className={appliedCoupon ? 'line-through text-gray-500' : 'font-semibold'}>
              {formatPrice(originalPrice)}
            </span>
          </div>
          
          {appliedCoupon && (
            <>
              <div className="flex flex-wrap gap-2 justify-between text-green-600">
                <span>{t("subscription.checkout.discount")}</span>
                <span>-{formatPrice(discountAmount)}</span>
              </div>
              <hr className="border-gray-300" />
              <div className="flex flex-wrap gap-2 justify-between text-lg font-bold">
                <span>{t("subscription.checkout.total")}</span>
                <span className="text-green-600">{formatPrice(finalPrice)}</span>
              </div>
            </>
          )}
          
          {!appliedCoupon && (
            <div className="flex flex-wrap gap-2 justify-between text-lg font-bold">
              <span>{t("subscription.checkout.total")}</span>
              <span>{formatPrice(finalPrice)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="min-w-0 space-y-2">
        <Label>{t("subscription.checkout.cardInformation")}</Label>
        <CardElement className="p-3 border rounded-md" />
      </div>

      {error && <p className="text-red-500 text-sm">{t(error)}</p>}
      
      <Button type="submit" className="w-full min-h-11 h-auto whitespace-normal" disabled={!stripe || loading}>
        {loading ? t("subscription.checkout.processing") : t("subscription.checkout.subscribe", { price: formatPrice(finalPrice) })}
      </Button>
    </form>
  );
}
