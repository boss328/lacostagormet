import {
  buildEmail,
  emailButton,
  emailHeading,
  escapeHtml,
  EMAIL_FONTS,
  EMAIL_PALETTE,
} from '@/lib/email/templates/base';

export type OrderShippedInput = {
  orderNumber: string;
  customerEmail: string;
  firstName: string | null;
  trackingNumber: string;
  /** Best-effort carrier guess. UPS / FedEx / USPS / null if unknown. */
  carrier: string | null;
  /** Pre-built tracking URL when carrier is known; null falls back to "track via {carrier}" prose. */
  trackingUrl: string | null;
};

export function renderOrderShipped(input: OrderShippedInput) {
  const greeting = input.firstName ? `Hi ${input.firstName},` : 'Hi,';
  const subject = `Your La Costa Gourmet order #${input.orderNumber} has shipped`;
  const preheader = input.carrier
    ? `Tracking ${input.trackingNumber} via ${input.carrier}.`
    : `Tracking ${input.trackingNumber}.`;

  const carrierLabel = input.carrier ? ` via ${escapeHtml(input.carrier)}` : '';

  const trackingLine = input.trackingUrl
    ? `<a href="${input.trackingUrl}" style="color:${EMAIL_PALETTE.ink};text-decoration:underline;">${escapeHtml(input.trackingNumber)}</a>${carrierLabel}`
    : `<strong>${escapeHtml(input.trackingNumber)}</strong>${carrierLabel}`;

  const buttonHtml = input.trackingUrl ? emailButton(input.trackingUrl, 'Track your order') : '';

  const bodyHtml = `
    ${emailHeading('Your order is on its way.')}
    <p style="margin:0 0 18px 0;">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 18px 0;">
      Good news — your order just left Carlsbad.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 8px 0;">
      <tr>
        <td style="font-family:${EMAIL_FONTS.mono};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${EMAIL_PALETTE.gold};padding-bottom:6px;">
          Order #${escapeHtml(input.orderNumber)}
        </td>
      </tr>
      <tr>
        <td style="font-family:${EMAIL_FONTS.sans};font-size:15px;color:${EMAIL_PALETTE.ink};">
          Tracking: ${trackingLine}
        </td>
      </tr>
    </table>

    ${buttonHtml}

    <p style="margin:24px 0 0 0;font-size:13px;color:${EMAIL_PALETTE.inkMuted};">
      Questions? Reply to this email or call <a href="tel:+18583541120" style="color:${EMAIL_PALETTE.ink};">(858) 354-1120</a>, Mon–Fri 9–5 PT.
    </p>

    <p style="margin:24px 0 0 0;font-family:${EMAIL_FONTS.serif};font-size:15px;font-style:italic;color:${EMAIL_PALETTE.ink};">
      — La Costa Gourmet
    </p>
  `;

  const bodyText = `Your order is on its way.

${greeting}

Good news — your order just left Carlsbad.

ORDER #${input.orderNumber}
Tracking: ${input.trackingNumber}${input.carrier ? ` via ${input.carrier}` : ''}
${input.trackingUrl ? `\nTrack: ${input.trackingUrl}\n` : ''}
Questions? Reply to this email or call (858) 354-1120, Mon–Fri 9–5 PT.

— La Costa Gourmet`;

  return buildEmail({ subject, preheader, bodyHtml, bodyText });
}
