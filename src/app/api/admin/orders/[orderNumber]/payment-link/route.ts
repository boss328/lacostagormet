import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, expectedSessionToken } from '@/lib/admin/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { isReadOnlyPreview } from '@/lib/preview-mode';
import { issueManualPaymentGrant } from '@/lib/checkout/manual-payment-grant';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'private, no-store' };

export async function POST(request: NextRequest, { params }: { params: { orderNumber: string } }) {
  const expected = await expectedSessionToken();
  if (!expected || request.cookies.get(ADMIN_COOKIE)?.value !== expected)
    return NextResponse.json({ error: 'Please sign in to admin.' }, { status: 401 });
  if (request.headers.get('origin') !== request.nextUrl.origin || isReadOnlyPreview())
    return NextResponse.json({ error: 'Payment links cannot be created here.' }, { status: 403 });
  const { data, error } = await createAdminClient().from('orders').select('id, total, status, source')
    .eq('order_number', params.orderNumber).maybeSingle();
  if (error) return NextResponse.json({ error: 'Could not load this order.' }, { status: 503 });
  if (!data || data.source !== 'manual' || data.status !== 'pending' || !(Number(data.total) > 0))
    return NextResponse.json({ error: 'Only unpaid manual orders with a balance can be paid by link.' }, { status: 409 });
  const grant = issueManualPaymentGrant({ orderId: data.id, amountCents: Math.round(Number(data.total) * 100) });
  if (!grant) return NextResponse.json({ error: 'Payment links are unavailable.' }, { status: 503 });
  return NextResponse.json({ path: `/pay/open/${grant}/` }, { headers: noStore });
}
