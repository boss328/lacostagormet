import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const fd = await req.formData();
  const vendor_id = String(fd.get('vendor_id') ?? '').trim();
  const label = String(fd.get('label') ?? '').trim();
  if (!vendor_id || !label) {
    return new NextResponse('vendor_id and label are required', { status: 400 });
  }
  const city = String(fd.get('city') ?? '').trim() || null;
  const state = String(fd.get('state') ?? '').trim().toUpperCase() || null;
  const zip = String(fd.get('zip') ?? '').trim() || null;
  const is_primary = fd.get('is_primary') === 'true';

  const admin = createAdminClient();

  // If asked to mark primary, demote any existing primary first (the unique index would otherwise reject)
  if (is_primary) {
    await admin
      .from('vendor_warehouses')
      .update({ is_primary: false })
      .eq('vendor_id', vendor_id)
      .eq('is_primary', true);
  }

  const { error } = await admin.from('vendor_warehouses').insert({
    vendor_id,
    label,
    city,
    state,
    zip,
    is_primary,
  });

  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.json({ ok: true });
}
