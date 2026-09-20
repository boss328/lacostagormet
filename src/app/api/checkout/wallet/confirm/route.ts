import { NextResponse, type NextRequest } from 'next/server';
import { ownedAttempt, sameOrigin } from '@/lib/wallets/session';
import { reconcileWalletPayment } from '@/lib/wallets/finalize';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  try {
    const body = await req.json();
    const a = await ownedAttempt(req, body.attemptId);
    if (a.method === 'amazon_pay') throw new Error('Use Amazon return route');
    const status = await reconcileWalletPayment(a, true);
    return NextResponse.json({ status, orderNumber: a.order_number }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Payment could not yet be confirmed. Do not pay again; check your order or contact us.' }, { status: 503 });
  }
}
