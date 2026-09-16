import { NextResponse, type NextRequest } from 'next/server';
import { ownedAttempt } from '@/lib/wallets/session';
import { reconcileWalletPayment } from '@/lib/wallets/finalize';
import { walletConfig } from '@/lib/wallets/config';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const origin = walletConfig().origin || req.url;
  try {
    const a = await ownedAttempt(req, req.nextUrl.searchParams.get('attempt') ?? '');
    if (a.method !== 'amazon_pay' || !a.provider_order_id || a.provider_order_id !== req.nextUrl.searchParams.get('amazonCheckoutSessionId')) throw new Error('Wrong session');
    try { await reconcileWalletPayment(a, true); } catch { /* Order remains pending for reconciliation. */ }
    return NextResponse.redirect(new URL(`/order/${a.order_number}/`, origin), 303);
  } catch {
    return NextResponse.redirect(new URL('/checkout/?error=wallet-unconfirmed', origin), 303);
  }
}
