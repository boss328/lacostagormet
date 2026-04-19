import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = createAdminClient();
  const { data: po } = await admin
    .from('vendor_orders')
    .select('order_id')
    .eq('id', params.id)
    .maybeSingle();

  const { error } = await admin
    .from('vendor_orders')
    .update({ status: 'shipped', shipped_at: new Date().toISOString() })
    .eq('id', params.id);
  if (error) return new NextResponse(error.message, { status: 500 });

  // If every PO on this order is now shipped, advance the order's
  // fulfillment_status to 'shipped' as well — keeps the orders list accurate.
  if (po?.order_id) {
    const { data: remaining } = await admin
      .from('vendor_orders')
      .select('id')
      .eq('order_id', po.order_id)
      .not('status', 'in', '(shipped,delivered,cancelled)');
    if (!remaining || remaining.length === 0) {
      await admin
        .from('orders')
        .update({ fulfillment_status: 'shipped' })
        .eq('id', po.order_id);
    }
  }

  return NextResponse.json({ ok: true });
}
