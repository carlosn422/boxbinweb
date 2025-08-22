import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';

// ⚡ Usa el SDK de Stripe que ya tengas en lib/stripe
import { createStripePaymentIntent } from '@/lib/stripe';

type TokenCheckoutFormProps = {
  userId: string;
  tokens: number; // tokens a comprar
  price: number;  // precio en cents (ej. 499 = $4.99)
  currency?: string;
};

export default function TokenCheckoutForm({ userId, tokens, price, currency = 'usd' }: TokenCheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { currentUser } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameOnCard, setNameOnCard] = useState('');

  const formatPrice = (priceInCents: number) => `$${(priceInCents / 100).toFixed(2)}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setError(null);

    try {
      // 1. Crear PaymentIntent con tu helper (sin backend extra)
      const { clientSecret } = await createStripePaymentIntent(
        price,
        currency,
        currentUser?.email ?? "",
        nameOnCard
      );

      // 2. Confirmar pago
      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: elements.getElement(CardElement)!,
          billing_details: {
            email: currentUser?.email || '',
            name: nameOnCard || currentUser?.displayName || 'Anonymous'
          }
        }
      });

      if (result.error) {
        setError(result.error.message || 'Payment failed');
        return;
      }

      if (result.paymentIntent?.status === 'succeeded') {
        // 3. Actualizar Firestore sumando tokens
        const userRef = doc(db, 'user_tokens', userId);
        const snap = await getDoc(userRef);

        if (snap.exists()) {
          const prevTokens = snap.data().tokens || 0;
          await updateDoc(userRef, {
            tokens: prevTokens + tokens,
            updatedAt: new Date()
          });
        } else {
          await setDoc(userRef, {
            tokens,
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }

        if ((window as any).ReactNativeWebView) {
          (window as any).ReactNativeWebView.postMessage(JSON.stringify({
            type: 'TOKENS_PURCHASE_SUCCESS',
            tokens
          }));
        } else {
          window.location.href = '/home';
        }
      }
    } catch (err) {
      console.error(err);
      setError('Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Datos del comprador */}
      <div className="space-y-2">
        <Label htmlFor="nameOnCard">Name on Card</Label>
        <Input
          id="nameOnCard"
          value={nameOnCard}
          onChange={(e) => setNameOnCard(e.target.value)}
          required
        />
      </div>

      {/* Resumen */}
      <div className="p-4 border rounded-lg bg-blue-50">
        <h3 className="font-semibold text-lg mb-3">Order Summary</h3>
        <div className="flex justify-between">
          <span>Tokens to Buy:</span>
          <span className="font-semibold">{tokens}</span>
        </div>
        <div className="flex justify-between text-lg font-bold mt-2">
          <span>Total to Pay:</span>
          <span>{formatPrice(price)}</span>
        </div>
      </div>

      {/* Tarjeta */}
      <div className="space-y-2">
        <Label>Card Information</Label>
        <CardElement className="p-3 border rounded-md" />
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <Button type="submit" className="w-full" disabled={!stripe || loading}>
        {loading ? 'Processing...' : `Buy ${tokens} tokens - ${formatPrice(price)}`}
      </Button>
    </form>
  );
}
