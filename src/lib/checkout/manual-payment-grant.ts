import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const MANUAL_PAYMENT_COOKIE = 'lcg_manual_payment';
export const MANUAL_LINK_LIFETIME = 7 * 24 * 60 * 60;

type Grant = { orderId: string; amountCents: number };
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

function signature(payload: string) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return null;
  return createHmac('sha256', secret).update('manual-order-payment/v1\0').update(payload).digest('base64url');
}

export function issueManualPaymentGrant({ orderId, amountCents }: Grant): string | null {
  if (!uuid.test(orderId) || !Number.isSafeInteger(amountCents) || amountCents <= 0) return null;
  const expires = Math.floor(Date.now() / 1000) + MANUAL_LINK_LIFETIME;
  const payload = [orderId, amountCents, expires].join('.');
  const mac = signature(payload);
  return mac && `${payload}.${mac}`;
}

export function verifyManualPaymentGrant(grant: string): Grant | null {
  if (!grant || grant.length > 200) return null;
  const parts = grant.split('.');
  if (parts.length !== 4) return null;
  const [orderId, cents, expires, provided] = parts;
  if (!uuid.test(orderId) || !/^[1-9]\d{0,14}$/.test(cents) || !/^\d{10}$/.test(expires)
    || !/^[\w-]{43}$/.test(provided) || Number(expires) <= Math.floor(Date.now() / 1000)) return null;
  const expected = signature(parts.slice(0, 3).join('.'));
  if (!expected || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return null;
  return { orderId, amountCents: Number(cents) };
}

export function manualPaymentReviewId(grant: string) {
  return createHash('sha256').update(grant).digest('hex');
}
