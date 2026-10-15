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
    .update({ status: 'confirmed' })
    .eq('id', params.id)
    // Evaluate the previous state in the write, not an earlier read.
    .eq('status', 'sent')
    .select('id')
    .maybeSingle();
  if (error) return new NextResponse(error.message, { status: 500 });
  if (!data) return new NextResponse('Only sent purchase orders can be acknowledged. Refresh to see the current status.', { status: 409 });
  return NextResponse.json({ ok: true });
}
