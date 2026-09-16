import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { walletConfig } from './config';
import type { WalletAttempt } from './verification';

export const cookieName = (id: string) => `lcg-wallet-${id}`;
export function attemptProof(id: string): string {
  const secret = process.env.WALLET_CHECKOUT_SECRET;
  if (!secret || secret.length < 32) throw new Error('Wallet checkout is not configured');
  return createHmac('sha256', secret).update(id).digest('hex');
}
export function sameOrigin(req: NextRequest): boolean {
  return !!walletConfig().origin && req.headers.get('origin') === walletConfig().origin;
}
export async function getAttempt(id: string): Promise<WalletAttempt> {
  const { data, error } = await createAdminClient().from('wallet_checkout_attempts').select('*').eq('id', id).single();
  if (error || !data) throw new Error('Checkout session unavailable');
  if (data.environment !== walletConfig().environment) throw new Error('Checkout environment mismatch');
  return data as WalletAttempt;
}
export async function ownedAttempt(req: NextRequest, id: string): Promise<WalletAttempt> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid checkout session');
  const proof = req.cookies.get(cookieName(id))?.value ?? '';
  const expected = attemptProof(id);
  if (proof.length !== expected.length || !timingSafeEqual(Buffer.from(proof), Buffer.from(expected))) {
    throw new Error('Checkout session unavailable');
  }
  return getAttempt(id);
}
export async function bindProviderOrder(a: WalletAttempt, providerId: string): Promise<WalletAttempt> {
  if (!/^[A-Za-z0-9-]{6,100}$/.test(providerId)) throw new Error('Invalid provider order');
  const admin = createAdminClient();
  const { error } = await admin.from('wallet_checkout_attempts').update({ provider_order_id: providerId })
    .eq('id', a.id).is('provider_order_id', null);
  if (error) throw new Error('Unable to save provider order');
  const fresh = await getAttempt(a.id);
  if (fresh.provider_order_id !== providerId) throw new Error('Another payment session is already linked to this order');
  return fresh;
}
