import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { shippingWriteError } from '@/lib/admin/shipping-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await shippingWriteError(req);
  if (denied) return denied;
  const { error } = await createAdminClient().rpc('shipping_mark_vendor_shipped', { p_po_id: params.id });
  if (error) return NextResponse.json({ errorMessage: error.code === 'P0001' ? error.message : 'Could not mark supplier shipment shipped.' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
