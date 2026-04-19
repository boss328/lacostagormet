import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['new', 'contacted', 'archived']);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const fd = await req.formData();
  const status = String(fd.get('status') ?? '').trim();
  if (!ALLOWED.has(status)) {
    return new NextResponse('Invalid status', { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('inquiries')
    .update({ status })
    .eq('id', params.id);
  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.json({ ok: true });
}
