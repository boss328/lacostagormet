import { NextRequest, NextResponse } from 'next/server';
import { MANUAL_LINK_LIFETIME, MANUAL_PAYMENT_COOKIE, verifyManualPaymentGrant } from '@/lib/checkout/manual-payment-grant';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest, { params }: { params: { grant: string } }) {
  const valid = verifyManualPaymentGrant(params.grant);
  const response = NextResponse.redirect(new URL('/pay/', request.url), 303);
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  response.cookies.set(MANUAL_PAYMENT_COOKIE, valid ? params.grant : '', {
    httpOnly: true, secure: request.nextUrl.protocol === 'https:', sameSite: 'lax', path: '/',
    maxAge: valid ? MANUAL_LINK_LIFETIME : 0,
  });
  return response;
}
