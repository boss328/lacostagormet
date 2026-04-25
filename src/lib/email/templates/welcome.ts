import {
  buildEmail,
  emailButton,
  emailHeading,
  escapeHtml,
  EMAIL_FONTS,
  EMAIL_PALETTE,
} from '@/lib/email/templates/base';
import { absoluteUrl } from '@/lib/email/from';

export type WelcomeEmailInput = {
  customerEmail: string;
  /** Optional first name; falls back to a neutral greeting. */
  firstName?: string | null;
};

export function renderWelcomeEmail(input: WelcomeEmailInput) {
  const greeting = input.firstName ? `Hi ${input.firstName},` : 'Hi,';
  const subject = 'Welcome to La Costa Gourmet';
  const preheader = 'Your account is ready — start shopping café-quality drinks.';
  const accountUrl = absoluteUrl('/account');
  const shopUrl = absoluteUrl('/shop');

  const bodyHtml = `
    ${emailHeading('Welcome.')}
    <p style="margin:0 0 18px 0;">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 18px 0;">
      Welcome to La Costa Gourmet. Your account is ready.
    </p>
    <p style="margin:0 0 18px 0;">
      You can sign in anytime at <a href="${accountUrl}" style="color:${EMAIL_PALETTE.ink};">lacostagourmet.com/account</a> to:
    </p>
    <ul style="margin:0 0 22px 0;padding-left:20px;font-family:${EMAIL_FONTS.sans};font-size:14.5px;line-height:1.7;color:${EMAIL_PALETTE.ink};">
      <li>Track orders</li>
      <li>Reorder favourites</li>
      <li>Save shipping addresses</li>
      <li>Get notified about new arrivals</li>
    </ul>

    ${emailButton(shopUrl, 'Shop the catalog')}

    <p style="margin:24px 0 0 0;font-size:13px;color:${EMAIL_PALETTE.inkMuted};">
      Questions? Reply to this email or call <a href="tel:+18583541120" style="color:${EMAIL_PALETTE.ink};">(858) 354-1120</a>.
    </p>

    <p style="margin:24px 0 0 0;font-family:${EMAIL_FONTS.serif};font-size:15px;font-style:italic;color:${EMAIL_PALETTE.ink};">
      — La Costa Gourmet
    </p>
  `;

  const bodyText = `Welcome.

${greeting}

Welcome to La Costa Gourmet. Your account is ready.

You can sign in anytime at ${accountUrl} to:
  - Track orders
  - Reorder favourites
  - Save shipping addresses
  - Get notified about new arrivals

Shop the catalog: ${shopUrl}

Questions? Reply to this email or call (858) 354-1120.

— La Costa Gourmet`;

  return buildEmail({ subject, preheader, bodyHtml, bodyText });
}
