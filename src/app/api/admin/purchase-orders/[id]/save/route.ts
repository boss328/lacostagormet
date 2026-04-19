import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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
  const { data: existing } = await admin
    .from('vendor_orders')
    .select('status')
    .eq('id', params.id)
    .maybeSingle();
  if (!existing) return new NextResponse('PO not found', { status: 404 });
  if (existing.status !== 'pending') {
    return new NextResponse('Only drafts can be edited', { status: 409 });
  }

  const { error } = await admin
    .from('vendor_orders')
    .update({ email_subject: subject, email_body: body, warehouse_id })
    .eq('id', params.id);
  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.json({ ok: true });
}
