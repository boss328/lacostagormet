import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FIELDS = ['name', 'contact_email', 'contact_name', 'phone', 'terms', 'notes'] as const;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const fd = await req.formData();
  const update: Record<string, string | null> = {};
  for (const f of FIELDS) {
    if (fd.has(f)) {
      const v = String(fd.get(f) ?? '').trim();
      update[f] = v === '' ? null : v;
    }
  }
  if (update.name === null || update.name === '') {
    return new NextResponse('Vendor name is required', { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from('vendors').update(update).eq('id', params.id);
  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.json({ ok: true });
}
