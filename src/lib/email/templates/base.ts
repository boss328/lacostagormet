import { ADMIN_NOTIFY_EMAIL, absoluteUrl } from '@/lib/email/from';

/**
 * Reusable HTML + plain-text email shell with La Costa Gourmet branding.
 *
 * Email design constraints (different from the website):
 *   - Table-based layout for Outlook compatibility.
 *   - System-font stack — most clients strip web fonts, so Fraunces falls
 *     back to Georgia for serifs and -apple-system for sans.
 *   - Inline CSS only (gmail strips <style> blocks aggressively).
 *   - Cream paper background (#f6eede) and ink text (#1a110a) match the
 *     site palette so customer recognises the brand even in Inbox preview.
 *
 * Output: { html, text } — Resend best practice is to ship both so the
 * recipient's client (or spam filter) can pick whichever it prefers.
 */

export type BuildEmailInput = {
  /** Inbox subject line. Used in <title> and the preheader hidden span. */
  subject: string;
  /** Hidden preheader text shown in the inbox preview pane. */
  preheader: string;
  /**
   * Body content as already-formatted HTML for the rich version, plus
   * the equivalent plain-text rendering. Keep paragraphs short and avoid
   * deeply nested tables — basic <p>, <a>, <table>, <strong> only.
   */
  bodyHtml: string;
  bodyText: string;
  /**
   * Default footer is the customer-facing block. Use 'admin' for internal
   * Ops notifications (no unsubscribe, no marketing chrome).
   */
  footer?: 'default' | 'admin';
  /**
   * Marketing-flavoured emails (abandoned cart) need a working unsubscribe.
   * Pass the absolute URL or relative path; we'll absolute-ize. Caller is
   * responsible for tokenising.
   */
  unsubscribeUrl?: string;
};

const PALETTE = {
  paper: '#f6eede',
  ink: '#1a110a',
  inkMuted: '#5b4c3d',
  gold: '#b88a48',
  goldBright: '#d4a961',
  rule: '#e6d8b9',
};

const SERIF_STACK =
  "Fraunces, Georgia, 'Times New Roman', Times, serif";

const SANS_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

const MONO_STACK =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

function defaultFooterHtml(unsubscribeUrl?: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;border-top:1px solid ${PALETTE.rule};padding-top:24px;">
      <tr>
        <td style="font-family:${SANS_STACK};font-size:12px;line-height:1.6;color:${PALETTE.inkMuted};text-align:center;">
          <p style="margin:0 0 8px 0;">
            <a href="mailto:customercare@lacostagourmet.com" style="color:${PALETTE.ink};text-decoration:none;">customercare@lacostagourmet.com</a>
            &nbsp;·&nbsp;
            <a href="tel:+18583541120" style="color:${PALETTE.ink};text-decoration:none;">(858) 354-1120</a>
          </p>
          <p style="margin:0 0 8px 0;font-family:${MONO_STACK};font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:${PALETTE.gold};">
            Corporate HQ · Carlsbad, California
          </p>
          ${
            unsubscribeUrl
              ? `<p style="margin:0 0 8px 0;font-size:11px;">
                   <a href="${unsubscribeUrl}" style="color:${PALETTE.inkMuted};text-decoration:underline;">Unsubscribe from cart reminders</a>
                 </p>`
              : ''
          }
          <p style="margin:0;font-family:${MONO_STACK};font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:${PALETTE.inkMuted};">
            © MMXXVI La Costa Gourmet
          </p>
        </td>
      </tr>
    </table>`;
}

function adminFooterHtml(): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border-top:1px solid ${PALETTE.rule};padding-top:16px;">
      <tr>
        <td style="font-family:${MONO_STACK};font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:${PALETTE.inkMuted};text-align:center;">
          La Costa Gourmet · Internal notification · ${ADMIN_NOTIFY_EMAIL}
        </td>
      </tr>
    </table>`;
}

export function buildEmail({
  subject,
  preheader,
  bodyHtml,
  bodyText,
  footer = 'default',
  unsubscribeUrl,
}: BuildEmailInput): { html: string; text: string } {
  const absUnsub = unsubscribeUrl
    ? unsubscribeUrl.startsWith('http')
      ? unsubscribeUrl
      : absoluteUrl(unsubscribeUrl)
    : undefined;

  const footerHtml =
    footer === 'admin' ? adminFooterHtml() : defaultFooterHtml(absUnsub);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PALETTE.paper};font-family:${SANS_STACK};color:${PALETTE.ink};">
  <span style="display:none !important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${PALETTE.paper};max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PALETTE.paper};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${PALETTE.rule};">
          <tr>
            <td style="padding:32px 36px 24px;border-bottom:1px solid ${PALETTE.rule};text-align:center;">
              <p style="margin:0;font-family:${SERIF_STACK};font-size:24px;font-weight:600;letter-spacing:-0.01em;color:${PALETTE.ink};">
                La Costa Gourmet
              </p>
              <p style="margin:6px 0 0 0;font-family:${MONO_STACK};font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${PALETTE.gold};">
                Indulge Your Craving
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 36px;font-family:${SANS_STACK};font-size:15px;line-height:1.65;color:${PALETTE.ink};">
              ${bodyHtml}
              ${footerHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    'LA COSTA GOURMET',
    'Indulge Your Craving',
    '',
    bodyText.trim(),
    '',
    '—',
    footer === 'admin'
      ? `Internal notification · ${ADMIN_NOTIFY_EMAIL}`
      : [
          'customercare@lacostagourmet.com · (858) 354-1120',
          'Corporate HQ · Carlsbad, California',
          ...(absUnsub ? [`Unsubscribe: ${absUnsub}`] : []),
          '© MMXXVI La Costa Gourmet',
        ].join('\n'),
  ].join('\n');

  return { html, text };
}

/** Minimal HTML escape for use inside subject/preheader. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Used by templates to render bold-display headings consistently. */
export function emailHeading(text: string): string {
  return `<p style="margin:0 0 18px 0;font-family:${SERIF_STACK};font-size:26px;line-height:1.15;letter-spacing:-0.015em;color:${PALETTE.ink};">${escapeHtml(text)}</p>`;
}

/** Inline button styled to match the site CTA palette. */
export function emailButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:${PALETTE.ink};">
    <a href="${href}" style="display:inline-block;padding:14px 26px;font-family:${MONO_STACK};font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:${PALETTE.goldBright};text-decoration:none;">
      ${escapeHtml(label)}
    </a>
  </td></tr></table>`;
}

/** Re-exported palette so templates pick up the same colours. */
export const EMAIL_PALETTE = PALETTE;
export const EMAIL_FONTS = { serif: SERIF_STACK, sans: SANS_STACK, mono: MONO_STACK };
