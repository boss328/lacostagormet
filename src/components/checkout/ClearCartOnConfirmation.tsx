'use client';

import { useEffect } from 'react';
import { useCartStore } from '@/stores/cart';

/**
 * Empties the cart on arrival at the order-confirmation page. Nothing else
 * ever clears it — before this, a customer bounced back from a payment
 * failure kept a full cart and could re-submit an identical order in one
 * click, which is exactly how the LCG-10035/10036 duplicate pair happened.
 */
export function ClearCartOnConfirmation() {
  const clear = useCartStore((s) => s.clear);
  useEffect(() => {
    clear();
  }, [clear]);
  return null;
}
