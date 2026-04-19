import 'server-only';
import { Resend } from 'resend';

let cached: Resend | null = null;

/**
 * Lazy-init Resend client. Throws if RESEND_API_KEY isn't set — callers
 * should catch and surface a friendly error in the UI.
 */
export function getResend(): Resend {
  if (cached) return cached;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  cached = new Resend(key);
  return cached;
}

/** Sender + reply-to defaults. Override per-call as needed. */
export const VENDOR_EMAIL_FROM = process.env.VENDOR_EMAIL_FROM ?? 'orders@lacostagourmet.com';
export const VENDOR_EMAIL_REPLY_TO = process.env.REPLY_TO_EMAIL ?? 'jeff@lacostagourmet.com';
