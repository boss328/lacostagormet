import { NextResponse, type NextRequest } from 'next/server';
import { prepareWalletAttempt } from '@/lib/wallets/prepare';
import { createPayPalOrder } from '@/lib/wallets/paypal';
import { amazonButtonConfig } from '@/lib/wallets/amazon';
import { sameOrigin, attemptProof, cookieName, bindProviderOrder } from '@/lib/wallets/session';
import { walletConfig } from '@/lib/wallets/config';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  try {
    const body = await req.json();
    // The request fingerprint binds retries to the HttpOnly browser-owner cookie.
    let a = await prepareWalletAttempt(body, req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown',
      req.cookies.get('lcg-wallet-owner')?.value ?? '');
    if (!walletConfig()[a.method]) throw new Error('Wallet unavailable');
    if (a.status === 'paid') return NextResponse.json({ attemptId: a.id, orderNumber: a.order_number, status: 'paid' });
    if (Date.now() - Date.parse(a.created_at) > 6 * 60 * 60 * 1000) throw new Error('Checkout expired');
    if (a.method !== 'amazon_pay' && !a.provider_order_id) {
      const order = await createPayPalOrder(a);
      if (!order.id) throw new Error('No provider order');
      a = await bindProviderOrder(a, order.id);
    }
    const res = NextResponse.json({ attemptId: a.id, orderNumber: a.order_number, total: Number(a.total).toFixed(2),
      providerOrderId: a.provider_order_id, ...(a.method === 'amazon_pay' ? { amazonConfig: amazonButtonConfig(a) } : {}) });
    res.cookies.set(cookieName(a.id), attemptProof(a.id), { httpOnly: true, secure: true, sameSite: 'lax',
      path: '/api/checkout/wallet', maxAge: 86400 });
    res.headers.set('Cache-Control', 'no-store');
    return res;
  } catch {
    return NextResponse.json({ error: 'Unable to start this payment. Keep this checkout open and try again, or contact us.' }, { status: 400 });
  }
}
