import { NextResponse } from 'next/server';
import { walletConfig } from '@/lib/wallets/config';
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
export const dynamic = 'force-dynamic';
export function GET() {
  const c = walletConfig();
  const res = NextResponse.json({ paypal: c.paypal, applePay: c.apple_pay, amazonPay: c.amazon_pay,
    paypalClientId: c.paypal ? process.env.PAYPAL_CLIENT_ID : undefined,
    amazonMerchantId: c.amazon_pay ? process.env.AMAZON_PAY_MERCHANT_ID : undefined,
    amazonPublicKeyId: c.amazon_pay ? process.env.AMAZON_PAY_PUBLIC_KEY_ID : undefined,
    sandbox: c.environment === 'sandbox' }, { headers: { 'Cache-Control': 'no-store' } });
  if (!cookies().has('lcg-wallet-owner')) res.cookies.set('lcg-wallet-owner', randomBytes(32).toString('hex'), {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/api/checkout/wallet', maxAge: 86400,
  });
  return res;
}
