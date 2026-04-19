import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/orders/[orderNumber]/ship
 * Body: { tracking_number: string }
 *
 * Admin gate: middleware already verified the lcg_admin cookie. Any request
 * hitting this handler has passed that check.
 */
export async function POST(req: NextRequest, { params }: { params: { orderNumber: string } }) {
  const body = (await req.json().catch(() => ({}))) as { tracking_number?: string };
  const tracking = (body.tracking_number ?? '').trim();
  if (!tracking) {
    return NextResponse.json({ errorMessage: 'tracking_number required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const orderNumber = params.orderNumber;

  const { data: order, error: fetchErr } = await admin
    .from('orders')
    .select('id, status, fulfillment_status, admin_notes')
    .eq('order_number', orderNumber)
    .maybeSingle();
  if (fetchErr || !order) {
    return NextResponse.json({ errorMessage: 'order not found' }, { status: 404 });
  }
  const row = order as { id: string; status: string; fulfillment_status: string; admin_notes: string | null };

  if (row.status !== 'paid') {
    return NextResponse.json(
      { errorMessage: 'order must be in paid status to ship' },
      { status: 400 },
    );
  }

  const noteLine = `[${new Date().toISOString()}] Shipped · tracking ${tracking}`;
  const notes = row.admin_notes ? `${row.admin_notes}\n${noteLine}` : noteLine;

  const { error: updateErr } = await admin
    .from('orders')
    .update({ fulfillment_status: 'shipped', admin_notes: notes })
    .eq('id', row.id);

  if (updateErr) {
    console.error('[admin ship] update failed', updateErr);
    return NextResponse.json({ errorMessage: 'update failed' }, { status: 500 });
  }

  // Phase 5 scope: log but don't email. Phase 7 wires the customer email.
  return NextResponse.json({ success: true });
}
