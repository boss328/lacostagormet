import { NextResponse, type NextRequest } from 'next/server';
import { isReadOnlyPreview } from '@/lib/preview-mode';
import { MANUAL_PAYMENT_COOKIE, manualPaymentReviewId, verifyManualPaymentGrant } from '@/lib/checkout/manual-payment-grant';
import { startManualHostedPayment } from '@/lib/checkout/manual-hosted';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function reply(body: object, status: number) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
}

export async function POST(request: NextRequest) {
  if (isReadOnlyPreview()) return reply({ success: false, errorMessage: 'Payments are disabled in this preview.' }, 409);
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return reply({ success: false, errorMessage: 'Invalid request origin.' }, 403);
  }
  const rawGrant = request.cookies.get(MANUAL_PAYMENT_COOKIE)?.value;
  try {
    const grant = rawGrant && await verifyManualPaymentGrant(rawGrant);
    if (!rawGrant || !grant) {
      return reply({ success: false, errorMessage: 'Open the payment link for your order.' }, 403);
    }
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || !('reviewId' in body) || body.reviewId !== manualPaymentReviewId(rawGrant)) {
      return reply({ success: false, errorMessage: 'Reopen your order link and review the amount before continuing.' }, 409);
    }
    // Use the merchant's configured site for live gateway redirects. Host or
    // forwarding headers must never put a different site into a payment form.
    const origin = process.env.AUTHNET_ENVIRONMENT === 'production'
      ? new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.lacostagourmet.com').origin
      : request.nextUrl.origin;
    const result = await startManualHostedPayment(grant, origin);
    return result.success ? reply(result, 200) : reply({ success: false, errorMessage: result.errorMessage }, result.status);
  } catch {
    return reply({ success: false, errorMessage: 'Payment checkout is temporarily unavailable. Please try again shortly.' }, 503);
  }
}
