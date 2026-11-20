import { useRef, useState } from 'react';
import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { billingErrorMessage, setupPaymentMethod, updatePaymentMethod, syncStripeSubscription } from '@/lib/stripe';
import { usePaymentAvailability } from './usePaymentAvailability';

export default function PaymentMethodForm({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useTranslation();
  const stripe = useStripe();
  const elements = useElements();
  const unavailable = usePaymentAvailability();
  const busy = useRef(false);
  const requestId = useRef(`req_${crypto.randomUUID().replace(/-/g, '')}`);
  const confirmedSetup = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resume, setResume] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements || busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    let paymentCompleted = false;
    try {
      if (!confirmedSetup.current) {
        const card = elements.getElement(CardElement);
        if (!card) throw new Error(t('billingRecovery.unavailable'));
        const setup = await setupPaymentMethod(requestId.current);
        const confirmation = await stripe.confirmCardSetup(setup.clientSecret, { payment_method: { card } });
        if (confirmation.error) throw confirmation.error;
        if (confirmation.setupIntent?.status !== 'succeeded') throw new Error(t('records.paymentPending'));
        confirmedSetup.current = confirmation.setupIntent.id;
        setResume(true);
      }
      const result = await updatePaymentMethod(confirmedSetup.current);
      if (result.clientSecret && ['requires_action', 'requires_confirmation', 'requires_payment_method'].includes(result.paymentStatus)) {
        const confirmation = await stripe.confirmCardPayment(result.clientSecret, { payment_method: result.paymentMethodId });
        if (confirmation.error) {
          // Allow the user to replace a declined card with a new setup.
          if (confirmation.error.type === 'card_error') {
            confirmedSetup.current = null;
            requestId.current = `req_${crypto.randomUUID().replace(/-/g, '')}`;
            setResume(false);
          }
          throw confirmation.error;
        }
        paymentCompleted = confirmation.paymentIntent?.status === 'succeeded';
      } else {
        paymentCompleted = result.paymentStatus === 'succeeded';
      }
      const saved = await syncStripeSubscription(result.subscriptionId);
      if (!['active', 'trialing'].includes(saved.status)) throw new Error(t('records.paymentPending'));
      onSuccess();
    } catch (err) {
      setError(paymentCompleted ? t('billingRecovery.syncPending') : billingErrorMessage(err));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  };

  return <form onSubmit={submit} className="space-y-4 min-w-0">
    <p id="payment-card-help" className="text-sm text-slate-600">{t('billingRecovery.cardHelp')}</p>
    {!resume && <CardElement className="p-3 border rounded-md" />}
    {unavailable && <p role="alert" className="text-sm text-red-600">{t('billingRecovery.unavailable')}</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <Button type="submit" disabled={!stripe || unavailable || loading} className="w-full h-auto min-h-10 whitespace-normal">
      {loading ? t('subscription.checkout.processing') : t(resume ? 'billingRecovery.resume' : 'billingRecovery.saveCard')}
    </Button>
  </form>;
}
