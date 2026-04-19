import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  autoDraft: boolean;
  replyTo: string;
  signature: string;
  attachCsv: boolean;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  const admin = createAdminClient();
  const upserts = [
    { key: 'vendor_po.auto_draft', value: body.autoDraft, category: 'vendor_po' },
    { key: 'vendor_po.default_reply_to', value: String(body.replyTo ?? ''), category: 'vendor_po' },
    { key: 'vendor_po.signature', value: String(body.signature ?? ''), category: 'vendor_po' },
    { key: 'vendor_po.attach_csv', value: body.attachCsv, category: 'vendor_po' },
  ];

  for (const u of upserts) {
    const { error } = await admin
      .from('settings')
      .upsert({ key: u.key, value: u.value, category: u.category }, { onConflict: 'key' });
    if (error) return new NextResponse(error.message, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
