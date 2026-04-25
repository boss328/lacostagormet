import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/cart/save
 *
 * Public endpoint called from /cart when the customer enters a valid
 * email and has items in their local cart. UPSERT into abandoned_carts
 * keyed on email — only one active row per email at a time. Recovered
 * or unsubscribed rows are left untouched and a fresh row is created
 * for the new attempt.
 *
 * Body:
 *   {
 *     email: string,
 *     cart_contents: Array<{ product_id, sku, name, price, quantity }>,
 *     subtotal_cents: number
 *   }
 */

type SaveBody = {
  email?: string;
  cart_contents?: Array<{
    product_id?: string;
    sku?: string;
    name?: string;
    price?: number;
    quantity?: number;
  }>;
  subtotal_cents?: number;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: SaveBody;
  try {
    body = (await req.json()) as SaveBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const email = (body.email ?? '').trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: 'invalid_email' }, { status: 400 });
  }

  const items = Array.isArray(body.cart_contents) ? body.cart_contents : [];
  if (items.length === 0) {
    return NextResponse.json({ ok: false, error: 'empty_cart' }, { status: 400 });
  }

  // Sanitise — only persist the customer-facing fields we'll need to
  // re-render the cart later. No cost, no vendor, no internal state.
  const cleanItems = items
    .filter((i) => i && typeof i === 'object' && i.product_id && i.quantity)
    .map((i) => ({
      product_id: String(i.product_id),
      sku: i.sku ? String(i.sku) : null,
      name: i.name ? String(i.name) : '',
      price: typeof i.price === 'number' ? i.price : Number(i.price ?? 0),
      quantity: Math.max(1, Math.floor(Number(i.quantity ?? 1))),
    }));

  if (cleanItems.length === 0) {
    return NextResponse.json({ ok: false, error: 'empty_cart' }, { status: 400 });
  }

  const subtotalCents = Math.max(0, Math.floor(Number(body.subtotal_cents ?? 0)));

  const admin = createAdminClient();

  // Look for an existing active row for this email.
  const { data: existing, error: fetchErr } = await admin
    .from('abandoned_carts')
    .select('id')
    .eq('email', email)
    .is('recovered_at', null)
    .is('unsubscribed_at', null)
    .order('last_updated_at', { ascending: false })
    .limit(1);

  if (fetchErr) {
    // Migration probably not applied — surface a soft failure so the
    // client doesn't keep retrying every keystroke.
    if (fetchErr.code === '42P01') {
      return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
    }
    console.error('[cart/save] lookup failed', fetchErr);
    return NextResponse.json({ ok: false, error: 'lookup_failed' }, { status: 500 });
  }

  const existingId = existing?.[0]?.id as string | undefined;

  if (existingId) {
    const { error: updateErr } = await admin
      .from('abandoned_carts')
      .update({
        cart_contents: cleanItems,
        subtotal_cents: subtotalCents,
        // Reset reminder counter so a freshly-active cart doesn't
        // immediately trigger a "you left something behind" email.
        reminder_sent_count: 0,
        last_reminder_sent_at: null,
      })
      .eq('id', existingId);
    if (updateErr) {
      console.error('[cart/save] update failed', updateErr);
      return NextResponse.json({ ok: false, error: 'update_failed' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, cartId: existingId, action: 'updated' });
  }

  const { data: created, error: insertErr } = await admin
    .from('abandoned_carts')
    .insert({
      email,
      cart_contents: cleanItems,
      subtotal_cents: subtotalCents,
    })
    .select('id')
    .single();

  if (insertErr || !created) {
    console.error('[cart/save] insert failed', insertErr);
    return NextResponse.json({ ok: false, error: 'insert_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, cartId: created.id as string, action: 'created' });
}
