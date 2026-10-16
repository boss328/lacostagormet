import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { shippingWriteError } from '@/lib/admin/shipping-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await shippingWriteError(req);
  if (denied) return denied;
  const fd = await req.formData();
  const subject = String(fd.get('subject') ?? '').trim();
  const body = String(fd.get('body') ?? '').trim();
  const warehouseRaw = fd.get('warehouse_id');
  const warehouse_id =
    typeof warehouseRaw === 'string' && warehouseRaw.length > 0 ? warehouseRaw : null;

  if (!subject || !body) {
    return new NextResponse('Subject and body are required', { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('vendor_orders')
    .update({ email_subject: subject, email_body: body, warehouse_id })
    .eq('id', params.id)
    .eq('status', 'pending')
    .is('email_send_started_at', null)
    .select('id')
    .maybeSingle();
  if (error) return new NextResponse(error.message, { status: 500 });
  if (!data) return new NextResponse('Only unsent drafts can be edited. A send attempt may need verification; refresh and contact support before changing it.', { status: 409 });
  return NextResponse.json({ ok: true });
}
