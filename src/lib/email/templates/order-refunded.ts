import {
  buildEmail,
  emailHeading,
  escapeHtml,
  EMAIL_FONTS,
  EMAIL_PALETTE,
} from '@/lib/email/templates/base';

export type OrderRefundedInput = {
  orderNumber: string;
  customerEmail: string;
  firstName: string | null;
  /** Refund amount in dollars (NOT cents). */
  refundAmount: number;
  /** Optional admin-supplied reason; rendered when present. */
  reason: string | null;
};

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function renderOrderRefunded(input: OrderRefundedInput) {
  const greeting = input.firstName ? `Hi ${input.firstName},` : 'Hi,';
  const subject = `Refund processing for La Costa Gourmet order #${input.orderNumber}`;
  const preheader = `Refund of ${fmt(input.refundAmount)} is on its way to your card.`;

  const reasonBlockHtml = input.reason
    ? `<p style="margin:0 0 18px 0;font-family:${EMAIL_FONTS.sans};font-size:14px;color:${EMAIL_PALETTE.ink};">
         <span style="font-family:${EMAIL_FONTS.mono};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${EMAIL_PALETTE.gold};">Reason</span><br>
         ${escapeHtml(input.reason)}
       </p>`
    : '';

  const reasonBlockText = input.reason ? `\nReason: ${input.reason}\n` : '';

  const bodyHtml = `
    ${emailHeading('Refund processing.')}
    <p style="margin:0 0 18px 0;">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 18px 0;">
      We're processing a refund for your recent order.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 8px 0;">
      <tr>
        <td style="font-family:${EMAIL_FONTS.mono};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${EMAIL_PALETTE.gold};padding-bottom:6px;">
          Order #${escapeHtml(input.orderNumber)}
        </td>
      </tr>
      <tr>
        <td style="font-family:${EMAIL_FONTS.sans};font-size:15px;color:${EMAIL_PALETTE.ink};">
          Refund amount: <strong>${fmt(input.refundAmount)}</strong>
        </td>
      </tr>
    </table>

    ${reasonBlockHtml}

    <p style="margin:24px 0 0 0;font-family:${EMAIL_FONTS.sans};font-size:14px;color:${EMAIL_PALETTE.ink};">
      The refund will appear on your original payment method within
      <strong>5–10 business days</strong>, depending on your bank.
    </p>

    <p style="margin:24px 0 0 0;font-size:13px;color:${EMAIL_PALETTE.inkMuted};">
      Questions? Reply to this email or call <a href="tel:+18583541120" style="color:${EMAIL_PALETTE.ink};">(858) 354-1120</a>, Mon–Fri 9–5 PT.
    </p>

    <p style="margin:24px 0 0 0;font-family:${EMAIL_FONTS.serif};font-size:15px;font-style:italic;color:${EMAIL_PALETTE.ink};">
      — La Costa Gourmet
    </p>
  `;

  const bodyText = `Refund processing.

${greeting}

We're processing a refund for your recent order.

ORDER #${input.orderNumber}
Refund amount: ${fmt(input.refundAmount)}
${reasonBlockText}
The refund will appear on your original payment method within 5–10
business days, depending on your bank.

Questions? Reply to this email or call (858) 354-1120, Mon–Fri 9–5 PT.

— La Costa Gourmet`;

  return buildEmail({ subject, preheader, bodyHtml, bodyText });
}
