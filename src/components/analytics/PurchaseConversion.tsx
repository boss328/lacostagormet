"use client";

import { useEffect } from "react";

export type PurchaseItem = {
  item_id: string;
  item_name: string;
  quantity: number;
  price: number;
};

type Props = {
  /** Order number — used as the GA4 transaction_id and the dedup key. */
  transactionId: string;
  /** Total transaction value the customer paid (incl. tax + shipping). */
  value: number;
  tax: number;
  shipping: number;
  currency: string;
  items: PurchaseItem[];
};

type GtagWindow = Window & { gtag?: (...args: unknown[]) => void };

/**
 * Fires the GA4 ecommerce `purchase` event once per order, from the order
 * confirmation page.
 *
 * Dedup — the confirmation page is reachable on refresh / back / bookmark, so a
 * localStorage flag keyed by transaction_id prevents re-firing. The stable
 * transaction_id is also a server-side backstop: GA4 and Google Ads dedupe
 * conversions that share a transaction_id.
 *
 * Ordering — waits for window.gtag, which the base tag's init script defines
 * immediately before it pushes the GA4 `config`. Gating on gtag's existence
 * therefore guarantees this event is never queued ahead of the property config
 * (covers the afterInteractive race on a hard page load).
 *
 * This is rendered only on production (the server gates it via
 * analyticsEnabled()), so the base gtag.js tag is always present when it runs.
 *
 * Google Ads — this GA4 `purchase` event is the prerequisite for Ads
 * conversions imported from GA4. If a dedicated Google Ads tag (AW-…) is added
 * later, also fire here:
 *   gtag('event','conversion',{ send_to:'AW-…/<label>', value, currency,
 *                               transaction_id });
 */
export function PurchaseConversion({
  transactionId,
  value,
  tax,
  shipping,
  currency,
  items,
}: Props) {
  useEffect(() => {
    // Fail closed: never send a purchase with a missing id or non-finite value
    // (would silently mis-record or drop revenue in GA4).
    if (!transactionId || !Number.isFinite(value)) return;

    const storageKey = `lcg_purchase_${transactionId}`;
    try {
      if (localStorage.getItem(storageKey)) return;
    } catch {
      // localStorage blocked (private mode) — fall through and rely on the
      // transaction_id dedupe instead.
    }

    let cancelled = false;
    let attempts = 0;
    let timer: number | undefined;

    const fire = () => {
      if (cancelled) return;
      const w = window as GtagWindow;

      if (typeof w.gtag === "function") {
        w.gtag("event", "purchase", {
          transaction_id: transactionId,
          value,
          currency,
          tax,
          shipping,
          items,
        });
        try {
          localStorage.setItem(storageKey, "1");
        } catch {
          /* ignore — see note above */
        }
        return;
      }

      // gtag.js init hasn't run yet — retry briefly (~10s) to cover the
      // afterInteractive timing race, then give up.
      if (attempts < 50) {
        attempts += 1;
        timer = window.setTimeout(fire, 200);
      }
    };

    fire();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
    // Order data is immutable for a given transaction_id; fire exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId]);

  return null;
}
