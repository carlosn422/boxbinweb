import { CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { v4 as uuid } from "uuid";
import { useAuth } from "@/context/AuthContext";
import { createStripePaymentIntent, creditPurchasedTokens } from "@/lib/stripe";
import { useTranslation } from "react-i18next";
import { usePaymentAvailability } from './usePaymentAvailability';
import { Loader2 } from "lucide-react";

type TokenCheckoutFormProps = {
  userId: string;
  packageId: string;
  tokens: number;
  price: number;
  currency?: string;
};

export default function TokenCheckoutForm({
  userId,
  packageId,
  tokens,
  price,
  currency = "usd",
}: TokenCheckoutFormProps) {
  const { t } = useTranslation();
  const stripe = useStripe();
  const elements = useElements();
  const { currentUser } = useAuth();

  const unavailable = usePaymentAvailability();
  const busy = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameOnCard, setNameOnCard] = useState("");

  const formatPrice = (priceInCents: number) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency }).format(priceInCents / 100);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || unavailable || busy.current) return;
    busy.current = true;

    setLoading(true);
    setError(null);

    try {
      if (!currentUser || currentUser.uid !== userId) throw new Error(t('inventory.sessionRequired'));
      const storageKey = `boxbin-token-payment:${currentUser.id}:${packageId}`;
      let pending: { requestId: string; paymentIntentId?: string; clientSecret?: string };
      try { pending = JSON.parse(localStorage.getItem(storageKey) || 'null') || { requestId: `req_${uuid().replace(/-/g, '')}` }; }
      catch { pending = { requestId: `req_${uuid().replace(/-/g, '')}` }; }
      localStorage.setItem(storageKey, JSON.stringify(pending));
      if (!pending.paymentIntentId || !pending.clientSecret) {
        const intent = await createStripePaymentIntent(packageId, pending.requestId);
        pending = { ...pending, ...intent };
        localStorage.setItem(storageKey, JSON.stringify(pending));
      }
      const previous = await stripe.retrievePaymentIntent(pending.clientSecret!);
      if (previous.error) throw previous.error;
      if (previous.paymentIntent?.status === 'processing') throw new Error(t('records.paymentPending'));
      if (previous.paymentIntent?.status !== 'succeeded') {
        if (previous.paymentIntent?.status === 'canceled') {
          localStorage.removeItem(storageKey);
          throw new Error(t('records.billingFailed'));
        }
        const result = await stripe.confirmCardPayment(pending.clientSecret!, {
          payment_method: { card: elements.getElement(CardElement)!, billing_details: { email: currentUser.email || '', name: nameOnCard || currentUser.displayName || '' } },
        });
        if (result.error) throw result.error;
        if (result.paymentIntent?.status !== 'succeeded') throw new Error(t('records.paymentPending'));
      }
      try { await creditPurchasedTokens(pending.paymentIntentId!); }
      catch { throw new Error(t('records.creditPending')); }
      localStorage.removeItem(storageKey);
      if ((window as any).ReactNativeWebView) {
        (window as any).ReactNativeWebView.postMessage(JSON.stringify({ type: 'TOKENS_PURCHASE_SUCCESS', tokens }));
      } else { window.location.href = '/home'; }
    } catch (err: any) {
      setError(err?.message || t('records.billingFailed'));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="nameOnCard" className="text-xs font-semibold text-slate-700">
          {t("aiModals.nameOnCard", { defaultValue: "Name on Card" })}
        </Label>
        <Input
          id="nameOnCard"
          value={nameOnCard}
          onChange={(e) => setNameOnCard(e.target.value)}
          placeholder="Jane Doe"
          className="h-9 text-xs rounded-xl border-slate-200"
        />
      </div>

      <div className="p-3.5 border border-brand-100 rounded-xl bg-brand-50/60 text-xs">
        <h4 className="font-bold text-slate-900 mb-2">
          {t("aiModals.orderSummary", { defaultValue: "Order Summary" })}
        </h4>
        <div className="flex justify-between text-slate-600 mb-1">
          <span>{t("aiModals.tokensToBuy", { defaultValue: "Tokens to Buy:" })}</span>
          <span className="font-bold text-slate-900">{tokens.toLocaleString()}</span>
        </div>
        <div className="flex justify-between font-bold text-sm text-slate-900 pt-1.5 border-t border-brand-200/60 mt-1.5">
          <span>{t("aiModals.totalToPay", { defaultValue: "Total to Pay:" })}</span>
          <span className="text-brand-700 font-mono">{formatPrice(price)}</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-slate-700">
          {t("aiModals.cardInformation", { defaultValue: "Card Information" })}
        </Label>
        <div className="p-3 border border-slate-200 rounded-xl bg-white shadow-2xs">
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: "13px",
                  color: "#1e293b",
                  "::placeholder": {
                    color: "#94a3b8",
                  },
                },
              },
            }}
          />
        </div>
      </div>

      {unavailable && <p role="alert" className="text-red-500 text-xs">{t("billingRecovery.unavailable")}</p>}
      {error && <p role="alert" className="text-red-500 text-xs">{error}</p>}

      <Button
        type="submit"
        className="w-full h-9 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-xs"
        disabled={!stripe || loading || unavailable}
      >
        {loading ? (
          <span className="flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>{t("aiModals.processingPayment", { defaultValue: "Processing payment..." })}</span>
          </span>
        ) : (
          t("aiModals.buyTokensBtn", {
            tokens: tokens.toLocaleString(),
            price: formatPrice(price),
            defaultValue: `Buy ${tokens} tokens - ${formatPrice(price)}`,
          })
        )}
      </Button>
    </form>
  );
}
