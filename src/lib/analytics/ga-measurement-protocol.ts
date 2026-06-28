import 'server-only';
import { GA_ID, analyticsEnabled } from '@/components/analytics/analytics-config';

// GA4 Measurement Protocol API secret. Create it in GA4 Admin → Data Streams →
// (the web stream) → Measurement Protocol API secrets. SERVER-ONLY secret — no
// NEXT_PUBLIC_ prefix. Without it, refund events are silently skipped.
const API_SECRET = process.env.GA_MEASUREMENT_PROTOCOL_API_SECRET;

const MP_ENDPOINT = 'https://www.google-analytics.com/mp/collect';
const SEND_TIMEOUT_MS = 3000;

/**
 * Stable per-order synthetic GA4 client_id.
 *
 * The original purchase fired client-side with the visitor's real client_id
 * (the _ga cookie), which we don't have on the server. GA4 nets ecommerce
 * refunds against the original purchase at the PROPERTY level by transaction_id
 * even when the client_id doesn't match, so a deterministic per-order id is
 * enough to correct headline revenue. It does NOT attribute the refund to the
 * original user / session / acquisition channel — for that, capture gtag's
 * client_id at purchase (gtag('get', GA_ID, 'client_id', cb)), store it on the
 * order, and pass it here instead. Deterministic so retries stay idempotent.
 */
function syntheticClientId(orderNumber: string): string {
  let h = 0;
  for (let i = 0; i < orderNumber.length; i++) {
    h = (h * 31 + orderNumber.charCodeAt(i)) >>> 0;
  }
  return `${h}.0`;
}

/**
 * Emit a GA4 `refund` event via the Measurement Protocol when a refunded or
 * voided order is reversed. Matched to the original purchase by transaction_id
 * (= order number). `value` is the amount being reversed — the full total for a
 * void, the refunded portion for a partial refund.
 *
 * What this actually does (be precise — don't oversell):
 *  - Nets the refund into GA4 property-level revenue (purchase/total revenue),
 *    keyed by transaction_id. This works despite the synthetic client_id above.
 *  - Does NOT correctly attribute the refund to the original user/session/
 *    channel (needs the real client_id — see syntheticClientId).
 *  - Is NOT a guaranteed Google Ads conversion retraction. If Ads conversions
 *    are imported from GA4 this is the GA4-side signal, but confirm propagation
 *    in the Ads account. For guaranteed conversion-value adjustment use the
 *    Google Ads Conversion Adjustment upload (RETRACTION/RESTATEMENT keyed by
 *    order id) — a separate path not implemented here.
 *
 * Best-effort: never throws. No-ops unless analytics is enabled (production)
 * and the API secret is set — symmetric with the prod-only purchase event, so
 * we don't refund a transaction GA4 never saw. Callers should `await` this (not
 * fire-and-forget): promises left pending after a serverless response may not
 * run. The abort timeout keeps the admin action responsive if MP is slow.
 *
 * NOTE: callers must only invoke this for orders that actually fired a purchase
 * event (storefront checkout). Admin manual orders never load the confirmation
 * page, so a refund for one would be a phantom negative — callers gate on that.
 */
export async function sendGa4RefundEvent(input: {
  orderNumber: string;
  value: number;
  currency?: string;
}): Promise<void> {
  if (!analyticsEnabled()) return; // dev/preview — expected no-op, stay quiet
  if (!API_SECRET) {
    // Production with the base tag live but no MP secret: refunds can't be
    // netted. Surface it rather than failing silently.
    console.warn(
      '[ga4 refund] GA_MEASUREMENT_PROTOCOL_API_SECRET not set — refund not netted for',
      input.orderNumber,
    );
    return;
  }
  if (!input.orderNumber || !Number.isFinite(input.value)) {
    console.error(
      '[ga4 refund] skipped: invalid order/value',
      input.orderNumber,
      input.value,
    );
    return;
  }

  const url =
    `${MP_ENDPOINT}?measurement_id=${encodeURIComponent(GA_ID)}` +
    `&api_secret=${encodeURIComponent(API_SECRET)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const body = JSON.stringify({
      client_id: syntheticClientId(input.orderNumber),
      events: [
        {
          name: 'refund',
          params: {
            currency: input.currency ?? 'USD',
            value: input.value,
            transaction_id: input.orderNumber,
          },
        },
      ],
    });
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });
    // MP returns 204 on success and does not validate the payload in prod, so a
    // non-2xx signals a transport/endpoint problem, not bad data. (Use GA4
    // DebugView to confirm GA4 actually accepts/nets the event — a 204 alone
    // is not proof.)
    if (!res.ok) {
      console.error(
        '[ga4 refund] non-2xx from Measurement Protocol',
        res.status,
        input.orderNumber,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn(
        `[ga4 refund] timed out after ${SEND_TIMEOUT_MS}ms for`,
        input.orderNumber,
      );
    } else {
      console.error('[ga4 refund] send failed', input.orderNumber, err);
    }
  } finally {
    clearTimeout(timer);
  }
}
