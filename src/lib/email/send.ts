import 'server-only';
import { getResend } from '@/lib/resend/client';
import { EMAIL_FROM, EMAIL_REPLY_TO } from '@/lib/email/from';

/**
 * Transactional email sender — wraps Resend with consistent defaults
 * and **never throws** to the caller. Email failures are observability
 * problems, not order-flow problems; we log and return { ok: false }.
 *
 * Tag transactional emails so the Resend dashboard groups them and
 * delivery dashboards stay searchable.
 */

export type EmailTag = { name: string; value: string };

export type SendInput = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  /** Override the default reply-to (customercare@). */
  replyTo?: string;
  /** Free-form Resend tags for dashboard filtering. */
  tags?: EmailTag[];
  /**
   * Override the From address. Default is RESEND_FROM_EMAIL
   * (customercare@). Use sparingly — most templates should ship from
   * the canonical address so threading works.
   */
  from?: string;
};

export type SendResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string };

export async function sendTransactionalEmail(input: SendInput): Promise<SendResult> {
  try {
    const resend = getResend();
    const result = await resend.emails.send({
      from: input.from ?? EMAIL_FROM,
      to: Array.isArray(input.to) ? input.to : [input.to],
      replyTo: input.replyTo ?? EMAIL_REPLY_TO,
      subject: input.subject,
      html: input.html,
      text: input.text,
      tags: input.tags,
    });
    if (result.error) {
      console.error('[email/send] resend error', {
        to: input.to,
        subject: input.subject,
        error: result.error,
      });
      return { ok: false, error: result.error.message ?? 'unknown' };
    }
    return { ok: true, id: result.data?.id ?? null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email/send] threw', {
      to: input.to,
      subject: input.subject,
      error: message,
    });
    return { ok: false, error: message };
  }
}
