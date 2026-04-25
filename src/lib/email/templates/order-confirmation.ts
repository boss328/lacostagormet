import {
  buildEmail,
  emailButton,
  emailHeading,
  escapeHtml,
  EMAIL_FONTS,
  EMAIL_PALETTE,
} from '@/lib/email/templates/base';
import { absoluteUrl } from '@/lib/email/from';

export type OrderConfirmationInput = {
  orderNumber: string;
  customerEmail: string;
  firstName: string | null;
  orderDate: Date;
  items: Array<{
    name: string;
    sku: string | null;
    quantity: number;
    unitPrice: number;
    lineSubtotal: number;
  }>;
  subtotal: number;
  shipping: number;
  total: number;
  shippingAddress: {
    fullName: string;
    address1: string;
    address2?: string | null;
    city: string;
    state: string;
    zip: string;
  };
  /** True when the order landed in payment_held (Auth.net response code 4). */
  isHeld: boolean;
};

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function renderOrderConfirmation(input: OrderConfirmationInput) {
  const greeting = input.firstName ? `Hi ${input.firstName},` : 'Hi,';
  const subject = `Your La Costa Gourmet order #${input.orderNumber} is confirmed`;
  const preheader = input.isHeld
    ? 'Order received — we are reviewing the payment and will be in touch shortly.'
    : "Thanks for your order — we'll have it shipped within 3 to 5 business days.";

  const itemRowsHtml = input.items
    .map(
      (it) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid ${EMAIL_PALETTE.rule};font-family:${EMAIL_FONTS.sans};font-size:14px;color:${EMAIL_PALETTE.ink};">
          <strong>${escapeHtml(it.name)}</strong>
          ${it.sku ? `<br><span style="font-family:${EMAIL_FONTS.mono};font-size:11px;color:${EMAIL_PALETTE.inkMuted};letter-spacing:0.06em;">${escapeHtml(it.sku)}</span>` : ''}
        </td>
        <td align="center" style="padding:10px 0;border-bottom:1px solid ${EMAIL_PALETTE.rule};font-family:${EMAIL_FONTS.mono};font-size:13px;color:${EMAIL_PALETTE.ink};">
          ×${it.quantity}
        </td>
        <td align="right" style="padding:10px 0;border-bottom:1px solid ${EMAIL_PALETTE.rule};font-family:${EMAIL_FONTS.serif};font-size:14px;color:${EMAIL_PALETTE.ink};">
          ${fmt(it.lineSubtotal)}
        </td>
      </tr>`,
    )
    .join('');

  const itemRowsText = input.items
    .map((it) => `  ${it.quantity} × ${it.name}${it.sku ? ` [${it.sku}]` : ''} — ${fmt(it.lineSubtotal)}`)
    .join('\n');

  const addr = input.shippingAddress;
  const addressHtml = [
    escapeHtml(addr.fullName),
    escapeHtml(addr.address1),
    addr.address2 ? escapeHtml(addr.address2) : null,
    escapeHtml(`${addr.city}, ${addr.state} ${addr.zip}`),
  ]
    .filter(Boolean)
    .join('<br>');

  const addressText = [
    addr.fullName,
    addr.address1,
    addr.address2,
    `${addr.city}, ${addr.state} ${addr.zip}`,
  ]
    .filter(Boolean)
    .join('\n');

  const orderViewUrl = absoluteUrl(`/order/${input.orderNumber}`);

  const heldBlockHtml = input.isHeld
    ? `<p style="margin:0 0 18px 0;padding:14px 16px;background:${EMAIL_PALETTE.paper};border:1px solid ${EMAIL_PALETTE.rule};font-family:${EMAIL_FONTS.sans};font-size:14px;color:${EMAIL_PALETTE.ink};">
         <strong>Note:</strong> Your payment is under quick review. You'll hear from us within a business day, and the order will move forward as soon as it clears.
       </p>`
    : '';

  const heldBlockText = input.isHeld
    ? '\nNote: Your payment is under quick review. You will hear from us within a business day.\n'
    : '';

  const bodyHtml = `
    ${emailHeading('Order confirmed.')}
    <p style="margin:0 0 18px 0;">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 18px 0;">
      Thanks for your order. We've received it and we'll have it on its way to
      you within <strong>3 to 5 business days</strong>.
    </p>
    ${heldBlockHtml}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 8px 0;">
      <tr>
        <td style="font-family:${EMAIL_FONTS.mono};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${EMAIL_PALETTE.gold};">
          Order #${escapeHtml(input.orderNumber)}
        </td>
        <td align="right" style="font-family:${EMAIL_FONTS.mono};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${EMAIL_PALETTE.inkMuted};">
          ${escapeHtml(formatDate(input.orderDate))}
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${EMAIL_PALETTE.rule};">
      ${itemRowsHtml}
      <tr>
        <td colspan="2" style="padding:14px 0 4px 0;font-family:${EMAIL_FONTS.sans};font-size:13px;color:${EMAIL_PALETTE.inkMuted};">Subtotal</td>
        <td align="right" style="padding:14px 0 4px 0;font-family:${EMAIL_FONTS.serif};font-size:14px;color:${EMAIL_PALETTE.ink};">${fmt(input.subtotal)}</td>
      </tr>
      <tr>
        <td colspan="2" style="padding:4px 0;font-family:${EMAIL_FONTS.sans};font-size:13px;color:${EMAIL_PALETTE.inkMuted};">Shipping</td>
        <td align="right" style="padding:4px 0;font-family:${EMAIL_FONTS.serif};font-size:14px;color:${EMAIL_PALETTE.ink};">${
          input.shipping === 0 ? 'FREE' : fmt(input.shipping)
        }</td>
      </tr>
      <tr>
        <td colspan="2" style="padding:14px 0 4px 0;border-top:1px solid ${EMAIL_PALETTE.ink};font-family:${EMAIL_FONTS.sans};font-size:14px;color:${EMAIL_PALETTE.ink};"><strong>Total</strong></td>
        <td align="right" style="padding:14px 0 4px 0;border-top:1px solid ${EMAIL_PALETTE.ink};font-family:${EMAIL_FONTS.serif};font-size:18px;color:${EMAIL_PALETTE.ink};"><strong>${fmt(input.total)}</strong></td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;">
      <tr>
        <td style="font-family:${EMAIL_FONTS.mono};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${EMAIL_PALETTE.gold};padding-bottom:8px;">
          Shipping to
        </td>
      </tr>
      <tr>
        <td style="font-family:${EMAIL_FONTS.sans};font-size:14px;line-height:1.55;color:${EMAIL_PALETTE.ink};">
          ${addressHtml}
        </td>
      </tr>
    </table>

    ${emailButton(orderViewUrl, 'View order')}

    <p style="margin:24px 0 0 0;font-size:13px;color:${EMAIL_PALETTE.inkMuted};">
      Questions? Reply to this email or call <a href="tel:+18583541120" style="color:${EMAIL_PALETTE.ink};">(858) 354-1120</a>, Mon–Fri 9–5 PT.
    </p>

    <p style="margin:24px 0 0 0;font-family:${EMAIL_FONTS.serif};font-size:15px;font-style:italic;color:${EMAIL_PALETTE.ink};">
      — La Costa Gourmet
    </p>
  `;

  const bodyText = `Order confirmed.

${greeting}

Thanks for your order. We've received it and we'll have it on its way to
you within 3 to 5 business days.
${heldBlockText}
ORDER #${input.orderNumber}
Placed: ${formatDate(input.orderDate)}

LINE ITEMS:
${itemRowsText}

  Subtotal: ${fmt(input.subtotal)}
  Shipping: ${input.shipping === 0 ? 'FREE' : fmt(input.shipping)}
  Total:    ${fmt(input.total)}

SHIPPING TO:
${addressText}

View your order: ${orderViewUrl}

Questions? Reply to this email or call (858) 354-1120, Mon–Fri 9–5 PT.

— La Costa Gourmet`;

  return buildEmail({ subject, preheader, bodyHtml, bodyText });
}
