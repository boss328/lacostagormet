import {
  buildEmail,
  emailButton,
  emailHeading,
  escapeHtml,
  EMAIL_FONTS,
  EMAIL_PALETTE,
} from '@/lib/email/templates/base';
import { absoluteUrl } from '@/lib/email/from';

export type AbandonedCartItem = {
  name: string;
  sku: string | null;
  quantity: number;
  /** Per-unit price in dollars. */
  price: number;
};

export type AbandonedCartInput = {
  cartId: string;
  unsubscribeToken: string;
  items: AbandonedCartItem[];
  subtotalCents: number;
  /** First reminder = 1, second reminder = 2. */
  reminderNumber: 1 | 2;
};

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDollars(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function renderAbandonedCart(input: AbandonedCartInput) {
  const subject =
    input.reminderNumber === 1
      ? 'You left something behind'
      : 'Still saved — your cart at La Costa Gourmet';
  const preheader = 'Your cart is saved — finish your order anytime.';
  const recoverUrl = absoluteUrl(`/cart?recover=${encodeURIComponent(input.cartId)}`);
  const unsubscribeUrl = absoluteUrl(
    `/unsubscribe?token=${encodeURIComponent(input.unsubscribeToken)}`,
  );

  const itemRowsHtml = input.items
    .map(
      (it) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid ${EMAIL_PALETTE.rule};font-family:${EMAIL_FONTS.sans};font-size:14px;color:${EMAIL_PALETTE.ink};">
          <strong>${escapeHtml(it.name)}</strong>
          ${it.sku ? `<br><span style="font-family:${EMAIL_FONTS.mono};font-size:11px;color:${EMAIL_PALETTE.inkMuted};">${escapeHtml(it.sku)}</span>` : ''}
        </td>
        <td align="center" style="padding:10px 0;border-bottom:1px solid ${EMAIL_PALETTE.rule};font-family:${EMAIL_FONTS.mono};font-size:13px;color:${EMAIL_PALETTE.ink};">×${it.quantity}</td>
        <td align="right" style="padding:10px 0;border-bottom:1px solid ${EMAIL_PALETTE.rule};font-family:${EMAIL_FONTS.serif};font-size:14px;color:${EMAIL_PALETTE.ink};">${fmtDollars(it.price * it.quantity)}</td>
      </tr>`,
    )
    .join('');

  const itemRowsText = input.items
    .map((it) => `  ${it.quantity} × ${it.name} — ${fmtDollars(it.price * it.quantity)}`)
    .join('\n');

  const bodyHtml = `
    ${emailHeading('You left something behind.')}
    <p style="margin:0 0 18px 0;">Hi,</p>
    <p style="margin:0 0 18px 0;">
      You left some items in your cart at La Costa Gourmet. We saved them for you —
      pick up right where you left off.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 8px 0;border-top:1px solid ${EMAIL_PALETTE.rule};">
      ${itemRowsHtml}
      <tr>
        <td colspan="2" style="padding:14px 0 4px 0;border-top:1px solid ${EMAIL_PALETTE.ink};font-family:${EMAIL_FONTS.sans};font-size:14px;color:${EMAIL_PALETTE.ink};"><strong>Subtotal</strong></td>
        <td align="right" style="padding:14px 0 4px 0;border-top:1px solid ${EMAIL_PALETTE.ink};font-family:${EMAIL_FONTS.serif};font-size:18px;color:${EMAIL_PALETTE.ink};"><strong>${fmt(input.subtotalCents)}</strong></td>
      </tr>
    </table>

    ${emailButton(recoverUrl, 'Return to your cart')}

    <p style="margin:24px 0 0 0;font-size:13px;color:${EMAIL_PALETTE.inkMuted};">
      Questions? Reply to this email or call <a href="tel:+18583541120" style="color:${EMAIL_PALETTE.ink};">(858) 354-1120</a>.
    </p>

    <p style="margin:24px 0 0 0;font-family:${EMAIL_FONTS.serif};font-size:15px;font-style:italic;color:${EMAIL_PALETTE.ink};">
      — La Costa Gourmet
    </p>
  `;

  const bodyText = `You left something behind.

You left some items in your cart at La Costa Gourmet. We saved them for you.

${itemRowsText}

  Subtotal: ${fmt(input.subtotalCents)}

Return to your cart: ${recoverUrl}

Questions? Reply to this email or call (858) 354-1120.

— La Costa Gourmet

---
Don't want these reminders? Unsubscribe: ${unsubscribeUrl}`;

  return buildEmail({
    subject,
    preheader,
    bodyHtml,
    bodyText,
    unsubscribeUrl,
  });
}
