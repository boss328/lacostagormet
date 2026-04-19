import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getResend, VENDOR_EMAIL_FROM, VENDOR_EMAIL_REPLY_TO } from '@/lib/resend/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Send the PO to the vendor via Resend, then transition status to 'sent'.
 *
 * Failure path: keep the PO as draft, surface the error in the response so
 * the UI can show it. Audit trail goes to payment_audit_log (reusing the
 * existing log infra rather than spinning up a parallel one).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const fd = await req.formData();
  const subject = String(fd.get('subject') ?? '').trim();
  const body = String(fd.get('body') ?? '').trim();
  const warehouseRaw = fd.get('warehouse_id');
  const warehouse_id =
    typeof warehouseRaw === 'string' && warehouseRaw.length > 0 ? warehouseRaw : null;

  if (!subject || !body) return new NextResponse('Subject and body are required', { status: 400 });

  const admin = createAdminClient();
  const { data: po } = await admin
    .from('vendor_orders')
    .select('status, vendor_id, order_id, vendor:vendors(contact_email, name)')
    .eq('id', params.id)
    .maybeSingle();

  if (!po) return new NextResponse('PO not found', { status: 404 });
  type Po = { status: string; vendor_id: string | null; order_id: string; vendor: { contact_email: string | null; name: string } | null };
  const poRow = po as unknown as Po;
  if (poRow.status !== 'pending') return new NextResponse('Only drafts can be sent', { status: 409 });
  const to = poRow.vendor?.contact_email;
  if (!to) return new NextResponse('Vendor has no contact email — set one and retry', { status: 400 });

  // Persist the latest editor state alongside the send so an admin's
  // unsaved tweaks aren't lost.
  await admin
    .from('vendor_orders')
    .update({ email_subject: subject, email_body: body, warehouse_id })
    .eq('id', params.id);

  let messageId: string | null = null;
  try {
    const resend = getResend();
    const result = await resend.emails.send({
      from: VENDOR_EMAIL_FROM,
      to: [to],
      replyTo: VENDOR_EMAIL_REPLY_TO,
      subject,
      text: body,
    });
    if (result.error) {
      void admin.from('payment_audit_log').insert({
        order_id: poRow.order_id,
        event_type: 'vendor_email_failed',
        source: 'po_send',
        error_detail: `${result.error.name ?? 'ResendError'}: ${result.error.message}`,
      });
      return new NextResponse(`Resend error: ${result.error.message}`, { status: 502 });
    }
    messageId = result.data?.id ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    void admin.from('payment_audit_log').insert({
      order_id: poRow.order_id,
      event_type: 'vendor_email_failed',
      source: 'po_send',
      error_detail: msg,
    });
    return new NextResponse(msg, { status: 500 });
  }

  const sentBy = process.env.REPLY_TO_EMAIL ?? 'admin';
  await admin
    .from('vendor_orders')
    .update({
      status: 'sent',
      email_sent_at: new Date().toISOString(),
      email_message_id: messageId,
      sent_by: sentBy,
    })
    .eq('id', params.id);

  void admin.from('payment_audit_log').insert({
    order_id: poRow.order_id,
    event_type: 'vendor_email_sent',
    source: 'po_send',
    error_detail: `to=${to} subject=${subject.slice(0, 80)} msgId=${messageId ?? 'none'}`,
  });

  return NextResponse.json({ ok: true, messageId });
}
