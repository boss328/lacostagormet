import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { shippingWriteError } from '@/lib/admin/shipping-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await shippingWriteError(req);
  if (denied) return denied;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('vendor_orders')
    .update({ status: 'cancelled' })
    .eq('id', params.id)
    // A stale draft page must not release items already sent to the supplier.
    .eq('status', 'pending')
    .is('email_send_started_at', null)
    .select('id')
    .maybeSingle();
  if (error) return new NextResponse(error.message, { status: 500 });
  if (!data) return new NextResponse('Only unsent drafts can be cancelled. A send attempt may need verification; refresh and contact support before changing it.', { status: 409 });
  return NextResponse.json({ ok: true });
}
