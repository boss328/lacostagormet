import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { walletConfig } from '@/lib/wallets/config';
import { reconcileWalletPayment } from '@/lib/wallets/finalize';
import type { WalletAttempt } from '@/lib/wallets/verification';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : '';
  const provided = req.headers.get('authorization') ?? '';
  if (!expected || expected.length !== provided.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(provided))) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  if (process.env.WALLET_CHECKOUT_ENABLED !== 'true') return NextResponse.json({ checked: 0 });
  const admin = createAdminClient();
  const { data, error } = await admin.from('wallet_checkout_attempts').select('*').eq('status', 'pending')
    .eq('environment', walletConfig().environment).not('provider_order_id', 'is', null)
    .gte('created_at', new Date(Date.now() - 14 * 86400000).toISOString())
    .order('last_checked_at', { ascending: true, nullsFirst: true }).limit(5);
  if (error) return new NextResponse('Reconciliation unavailable', { status: 503 });
  let paid = 0, failed = 0;
  await Promise.all(((data ?? []) as WalletAttempt[]).map(async a => {
    try { if (await reconcileWalletPayment(a) === 'paid') paid++; } catch { failed++; }
    await admin.from('wallet_checkout_attempts').update({ last_checked_at: new Date().toISOString() }).eq('id', a.id);
  }));
  return NextResponse.json({ checked: data?.length ?? 0, paid, failed });
}
