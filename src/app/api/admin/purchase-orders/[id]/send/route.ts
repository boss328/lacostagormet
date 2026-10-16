import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { shippingWriteError } from '@/lib/admin/shipping-access';
import { getResend, VENDOR_EMAIL_FROM, VENDOR_EMAIL_REPLY_TO } from '@/lib/resend/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const verificationMessage = 'This PO send needs verification. Its items remain reserved. Check the email status with support before sending, editing, or cancelling it.';

/** Claim and freeze the draft before email. Uncertain attempts stay claimed. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await shippingWriteError(req);
  if (denied) return denied;
  const fd = await req.formData();
  const subject = String(fd.get('subject') ?? '').trim();
  const body = String(fd.get('body') ?? '').trim();
  const warehouseRaw = fd.get('warehouse_id');
  const warehouse_id = typeof warehouseRaw === 'string' && warehouseRaw.length > 0 ? warehouseRaw : null;
  if (!subject || !body) return new NextResponse('Subject and body are required', { status: 400 });

  const admin = createAdminClient();
  const { data: po, error: lookupError } = await admin
    .from('vendor_orders')
    .select('status, email_send_started_at, order_id, vendor:vendors(contact_email)')
    .eq('id', params.id)
    .maybeSingle();
  if (lookupError) return new NextResponse('The PO could not be checked. No email was sent.', { status: 500 });
  if (!po) return new NextResponse('PO not found', { status: 404 });
  const poRow = po as unknown as {
    status: string;
    email_send_started_at: string | null;
    order_id: string;
    vendor: { contact_email: string | null } | null;
  };
  if (poRow.status !== 'pending') return new NextResponse('Only drafts can be sent', { status: 409 });
  if (poRow.email_send_started_at) return new NextResponse(verificationMessage, { status: 409 });
  const to = poRow.vendor?.contact_email;
  if (!to) return new NextResponse('Vendor has no contact email — set one and retry', { status: 400 });

  // This single conditional write arbitrates sends, saves and cancellations.
  // It also fails before email if required vendor schema has not been installed.
  const { data: claimed, error: claimError } = await admin
    .from('vendor_orders')
    .update({ email_subject: subject, email_body: body, warehouse_id, email_send_started_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('status', 'pending')
    .is('email_send_started_at', null)
    .select('id, email_subject, email_body, email_send_started_at')
    .maybeSingle();
  if (claimError) return new NextResponse('The send attempt could not be saved. No email was sent by this request. Refresh and verify the PO status before retrying.', { status: 500 });
  if (!claimed) return new NextResponse(verificationMessage, { status: 409 });

  async function audit(eventType: string, detail: string) {
    // Audit failure must not clear the claim or turn a confirmed send into a retry.
    try {
      const { error } = await admin.from('payment_audit_log').insert({
        order_id: poRow.order_id,
        event_type: eventType,
        source: 'po_send',
        error_detail: detail,
      });
      if (error) console.error('[po_send] audit could not be saved', error.code);
    } catch {
      console.error('[po_send] audit could not be saved');
    }
  }

  let messageId: string;
  try {
    const result = await getResend().emails.send({
      from: VENDOR_EMAIL_FROM,
      to: [to],
      replyTo: VENDOR_EMAIL_REPLY_TO,
      subject: claimed.email_subject,
      text: claimed.email_body,
    });
    if (result.error || !result.data?.id) {
      await audit('vendor_email_failed', 'Claimed send was not confirmed by the email provider. Reconcile before further changes.');
      return new NextResponse(verificationMessage, { status: 502 });
    }
    messageId = result.data.id;
  } catch {
    await audit('vendor_email_failed', 'Claimed send response was interrupted. Reconcile before further changes.');
    return new NextResponse(verificationMessage, { status: 502 });
  }

  const { data: finalized, error: finishError } = await admin
    .from('vendor_orders')
    .update({
      status: 'sent',
      email_sent_at: new Date().toISOString(),
      email_message_id: messageId,
      sent_by: process.env.REPLY_TO_EMAIL ?? 'admin',
    })
    .eq('id', params.id)
    .eq('status', 'pending')
    .eq('email_send_started_at', claimed.email_send_started_at)
    .select('id')
    .maybeSingle();
  if (finishError || !finalized) {
    await audit('vendor_email_failed', `Email accepted as ${messageId}; final status was not saved. Reconcile before further changes.`);
    return new NextResponse(verificationMessage, { status: 502 });
  }
  await audit('vendor_email_sent', `Email accepted as ${messageId}.`);
  return NextResponse.json({ ok: true, messageId });
}
