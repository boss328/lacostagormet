import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/cart/recover?id=<abandoned_cart_id>
 *
 * Returns the saved cart contents so /cart can rehydrate the local
 * Zustand store. Read-only — does NOT mark the cart as recovered;
 * recovery is owned by checkout finalization in notifyOrderPlaced.
 */
export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ ok: false, error: 'id_required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('abandoned_carts')
    .select('id, email, cart_contents, subtotal_cents, recovered_at, unsubscribed_at')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
    }
    console.error('[cart/recover] lookup failed', error);
    return NextResponse.json({ ok: false, error: 'lookup_failed' }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    email: data.email as string,
    items: data.cart_contents,
    subtotal_cents: data.subtotal_cents as number,
    recovered: data.recovered_at !== null,
    unsubscribed: data.unsubscribed_at !== null,
  });
}
