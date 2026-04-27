import {
  buildEmail,
  emailButton,
  emailHeading,
  escapeHtml,
  EMAIL_FONTS,
  EMAIL_PALETTE,
} from '@/lib/email/templates/base';
import { absoluteUrl } from '@/lib/email/from';

export type AdminOrderNotificationInput = {
  orderId: string;
  orderNumber: string;
  total: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  orderDate: Date;
  items: Array<{ name: string; sku: string | null; quantity: number }>;
  shippingAddress: {
    fullName: string;
    /** Optional B2B business name; rendered above the recipient name. */
    company?: string | null;
    address1: string;
    address2?: string | null;
    city: string;
    state: string;
    zip: string;
  };
  isHeld: boolean;
};

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

function formatDateTime(d: Date): string {
  const date = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' });
  return `${date} at ${time} PT`;
}

export function renderAdminOrderNotification(input: AdminOrderNotificationInput) {
  const subject = `🛒 New order #${input.orderNumber} — ${fmt(input.total)}${input.isHeld ? ' [HELD]' : ''}`;
  const preheader = `${input.customerName} · ${input.items.length} ${input.items.length === 1 ? 'line' : 'lines'} · ${fmt(input.total)}`;

  const itemsHtml = input.items
    .map(
      (it) =>
        `<li style="margin:0 0 6px 0;font-family:${EMAIL_FONTS.sans};font-size:14px;color:${EMAIL_PALETTE.ink};">
           <strong>${it.quantity}×</strong> ${escapeHtml(it.name)}${it.sku ? ` <span style="font-family:${EMAIL_FONTS.mono};font-size:11px;color:${EMAIL_PALETTE.inkMuted};">[${escapeHtml(it.sku)}]</span>` : ''}
         </li>`,
    )
    .join('');

  const itemsText = input.items
    .map((it) => `  - ${it.quantity}× ${it.name}${it.sku ? ` [${it.sku}]` : ''}`)
    .join('\n');

  const addr = input.shippingAddress;
  const company = (addr.company ?? '').trim();
  const addressText = [
    company || null,
    addr.fullName,
    addr.address1,
    addr.address2,
    `${addr.city}, ${addr.state} ${addr.zip}`,
  ]
    .filter(Boolean)
    .join('\n');

  const adminUrl = absoluteUrl(`/admin/orders/${input.orderNumber}`);

  const bodyHtml = `
    ${emailHeading('New order placed.')}
    ${input.isHeld ? `<p style="margin:0 0 18px 0;padding:10px 14px;background:#fff7e0;border-left:4px solid ${EMAIL_PALETTE.gold};font-family:${EMAIL_FONTS.mono};font-size:12px;letter-spacing:0.06em;color:${EMAIL_PALETTE.ink};">PAYMENT HELD FOR REVIEW — verify before shipping.</p>` : ''}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
      <tr>
        <td style="font-family:${EMAIL_FONTS.mono};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${EMAIL_PALETTE.gold};padding-bottom:6px;">Order</td>
      </tr>
      <tr>
        <td style="font-family:${EMAIL_FONTS.sans};font-size:15px;color:${EMAIL_PALETTE.ink};">
          <strong>#${escapeHtml(input.orderNumber)}</strong> — ${fmt(input.total)} — ${escapeHtml(input.customerName)}<br>
          <span style="color:${EMAIL_PALETTE.inkMuted};font-size:13px;">${escapeHtml(formatDateTime(input.orderDate))}</span>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
      <tr>
        <td style="font-family:${EMAIL_FONTS.mono};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${EMAIL_PALETTE.gold};padding-bottom:6px;">Line items</td>
      </tr>
      <tr>
        <td>
          <ul style="margin:0;padding-left:18px;">${itemsHtml}</ul>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
      <tr>
        <td style="font-family:${EMAIL_FONTS.mono};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${EMAIL_PALETTE.gold};padding-bottom:6px;">Ship to</td>
      </tr>
      <tr>
        <td style="font-family:${EMAIL_FONTS.sans};font-size:14px;line-height:1.55;color:${EMAIL_PALETTE.ink};white-space:pre-line;">${escapeHtml(addressText)}</td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px 0;">
      <tr>
        <td style="font-family:${EMAIL_FONTS.mono};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${EMAIL_PALETTE.gold};padding-bottom:6px;">Customer</td>
      </tr>
      <tr>
        <td style="font-family:${EMAIL_FONTS.sans};font-size:14px;color:${EMAIL_PALETTE.ink};">
          ${escapeHtml(input.customerName)} · <a href="mailto:${escapeHtml(input.customerEmail)}" style="color:${EMAIL_PALETTE.ink};">${escapeHtml(input.customerEmail)}</a>${input.customerPhone ? ` · ${escapeHtml(input.customerPhone)}` : ''}
        </td>
      </tr>
    </table>

    ${emailButton(adminUrl, 'View in admin')}

    <p style="margin:18px 0 0 0;font-family:${EMAIL_FONTS.serif};font-size:13px;font-style:italic;color:${EMAIL_PALETTE.inkMuted};">
      — La Costa Gourmet system
    </p>
  `;

  const bodyText = `New order placed.
${input.isHeld ? '\n*** PAYMENT HELD FOR REVIEW — verify before shipping. ***\n' : ''}
Order #${input.orderNumber} — ${fmt(input.total)} — ${input.customerName}
Placed: ${formatDateTime(input.orderDate)}

LINE ITEMS:
${itemsText}

SHIP TO:
${addressText}

CUSTOMER:
${input.customerName} · ${input.customerEmail}${input.customerPhone ? ` · ${input.customerPhone}` : ''}

View in admin: ${adminUrl}

— La Costa Gourmet system`;

  return buildEmail({ subject, preheader, bodyHtml, bodyText, footer: 'admin' });
}
