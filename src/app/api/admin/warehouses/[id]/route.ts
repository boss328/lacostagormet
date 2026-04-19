import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const fd = await req.formData();
  const update: Record<string, string | boolean | null> = {};
  for (const k of ['label', 'city', 'state', 'zip']) {
    if (fd.has(k)) {
      const v = String(fd.get(k) ?? '').trim();
      update[k] = v === '' ? null : v;
    }
  }

  const admin = createAdminClient();

  // is_primary toggles need to demote the current primary in the same vendor.
  if (fd.has('is_primary')) {
    const wantPrimary = fd.get('is_primary') === 'true';
    update.is_primary = wantPrimary;
    if (wantPrimary) {
      const { data: row } = await admin
        .from('vendor_warehouses')
        .select('vendor_id')
        .eq('id', params.id)
        .maybeSingle();
      if (row?.vendor_id) {
        await admin
          .from('vendor_warehouses')
          .update({ is_primary: false })
          .eq('vendor_id', row.vendor_id)
          .eq('is_primary', true);
      }
    }
  }

  const { error } = await admin
    .from('vendor_warehouses')
    .update(update)
    .eq('id', params.id);
  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = createAdminClient();
  const { error } = await admin.from('vendor_warehouses').delete().eq('id', params.id);
  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.json({ ok: true });
}
