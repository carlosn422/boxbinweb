import { useEffect, useState } from 'react';
import { stripeConfigured, stripePromise } from '@/lib/stripe';

export function usePaymentAvailability() {
  const [unavailable, setUnavailable] = useState(!stripeConfigured);
  useEffect(() => {
    let mounted = true;
    void stripePromise.then(stripe => { if (mounted) setUnavailable(!stripe); });
    return () => { mounted = false; };
  }, []);
  return unavailable;
}
