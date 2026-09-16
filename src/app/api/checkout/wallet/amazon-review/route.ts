import { NextResponse, type NextRequest } from 'next/server';
import { ownedAttempt, bindProviderOrder } from '@/lib/wallets/session';
import { getAmazonSession, prepareAmazonPayment } from '@/lib/wallets/amazon';
import { walletConfig } from '@/lib/wallets/config';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('attempt') ?? '';
    const sessionId = req.nextUrl.searchParams.get('amazonCheckoutSessionId') ?? '';
    let a = await ownedAttempt(req, id);
    if (a.method !== 'amazon_pay' || !/^[A-Za-z0-9-]{6,100}$/.test(sessionId)) throw new Error('Invalid session');
    if (a.status === 'paid') return NextResponse.redirect(new URL(`/order/${a.order_number}/`, walletConfig().origin), 303);
    const session = await getAmazonSession(sessionId);
    if (session.merchantMetadata?.merchantReferenceId !== a.id || session.statusDetails?.state !== 'Open') throw new Error('Invalid Amazon reference');
    // Bind before authorization: replaying a button payload cannot charge a second Amazon session.
    a = await bindProviderOrder(a, sessionId);
    const prepared = await prepareAmazonPayment(a);
    const target = new URL(prepared.webCheckoutDetails?.amazonPayRedirectUrl ?? '');
    if (target.protocol !== 'https:' || !['payments.amazon.com', 'payments-sandbox.amazon.com'].includes(target.hostname)) throw new Error('Invalid Amazon redirect');
    return NextResponse.redirect(target, { status: 303, headers: { 'Referrer-Policy': 'no-referrer' } });
  } catch {
    return NextResponse.redirect(new URL('/checkout/?error=wallet-unconfirmed', walletConfig().origin || req.url), 303);
  }
}
