'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const FIRST_POLL_MS = 2_500;
const POLL_MS = 5_000;
// Auth.net's redirect return usually beats settlement visibility by
// seconds, and the webhook by less than a minute; past this window the
// page's "contact us before placing the order again" copy is the answer.
const GIVE_UP_MS = 3 * 60_000;

/**
 * Rendered by the order page while the order is 'pending' — i.e. the
 * customer came back from Auth.net before we could confirm the payment
 * (the redirect return carries no transaction data, so confirmation is
 * always server-side and slightly behind). Polls the payment-status
 * endpoint, which actively re-verifies against Auth.net, and refreshes
 * the page the moment the order leaves 'pending' so the customer sees
 * the real thank-you state without touching anything.
 */
export function PendingPaymentPoller({ orderNumber }: { orderNumber: string }) {
  const router = useRouter();

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const startedAt = Date.now();

    async function tick() {
      if (stopped) return;
      try {
        // Trailing slash matters: the slash-less path 308s.
        const res = await fetch('/api/checkout/payment-status/', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ orderNumber }),
          cache: 'no-store',
        });
        const body = (await res.json()) as { status?: string };
        if (stopped) return;
        if (body.status === 'paid' || body.status === 'payment_held') {
          router.refresh();
          return;
        }
        if (body.status === 'cancelled') {
          // Payment declined after the return — send them somewhere the
          // decline is actually explained (this page 404s on cancelled).
          router.push('/checkout?error=declined');
          return;
        }
      } catch {
        // Transient network hiccup — just poll again.
      }
      if (Date.now() - startedAt < GIVE_UP_MS) {
        timer = setTimeout(tick, POLL_MS);
      }
    }

    timer = setTimeout(tick, FIRST_POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [orderNumber, router]);

  return null;
}
