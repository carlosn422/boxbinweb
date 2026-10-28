import { CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { createStripePaymentIntent } from "@/lib/stripe";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

type TokenCheckoutFormProps = {
  userId: string;
  tokens: number;
  price: number;
  currency?: string;
};

export default function TokenCheckoutForm({
  userId,
  tokens,
  price,
  currency = "usd",
}: TokenCheckoutFormProps) {
  const { t } = useTranslation();
  const stripe = useStripe();
  const elements = useElements();
  const { currentUser } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameOnCard, setNameOnCard] = useState("");

  const formatPrice = (priceInCents: number) =>
    `$${(priceInCents / 100).toFixed(2)}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setError(null);

    try {
      const { clientSecret } = await createStripePaymentIntent(
        price,
        currency,
        currentUser?.email ?? "",
        nameOnCard
      );

      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: elements.getElement(CardElement)!,
          billing_details: {
            email: currentUser?.email || "",
            name: nameOnCard || currentUser?.displayName || "Anonymous",
          },
        },
      });

      if (result.error) {
        setError(result.error.message || "Payment failed");
        return;
      }

      if (result.paymentIntent?.status === "succeeded") {
        const { data: existing } = await supabase
          .from("user_tokens")
          .select("tokens")
          .eq("id", userId)
          .maybeSingle();

        const currentTokens = (existing?.tokens as number) || 0;
        const newTokens = currentTokens + tokens;

        await supabase.from("user_tokens").upsert({
          id: userId,
          tokens: newTokens,
          updatedAt: new Date().toISOString(),
        });

        await supabase.from("users").update({
          tokens: newTokens,
        }).eq("id", userId);

        if ((window as any).ReactNativeWebView) {
          (window as any).ReactNativeWebView.postMessage(
            JSON.stringify({
              type: "TOKENS_PURCHASE_SUCCESS",
              tokens,
            })
          );
        } else {
          window.location.href = "/home";
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Unexpected error");
    } finally {
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
          required
        />
      </div>

      <div className="p-3.5 border border-blue-100 rounded-xl bg-blue-50/60 text-xs">
        <h4 className="font-bold text-slate-900 mb-2">
          {t("aiModals.orderSummary", { defaultValue: "Order Summary" })}
        </h4>
        <div className="flex justify-between text-slate-600 mb-1">
          <span>{t("aiModals.tokensToBuy", { defaultValue: "Tokens to Buy:" })}</span>
          <span className="font-bold text-slate-900">{tokens.toLocaleString()}</span>
        </div>
        <div className="flex justify-between font-bold text-sm text-slate-900 pt-1.5 border-t border-blue-200/60 mt-1.5">
          <span>{t("aiModals.totalToPay", { defaultValue: "Total to Pay:" })}</span>
          <span className="text-blue-700 font-mono">{formatPrice(price)}</span>
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

      {error && <p className="text-red-500 text-xs">{error}</p>}

      <Button
        type="submit"
        className="w-full h-9 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-xs"
        disabled={!stripe || loading}
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
