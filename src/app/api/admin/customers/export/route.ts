import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { toCsv, csvFilename } from '@/lib/admin/csv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get('lcg_admin')?.value;
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || cookie !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const search = req.nextUrl.searchParams.get('q') ?? '';
  const admin = createAdminClient();

  // Paginate through the full set — 6,335 customers exceed the default cap.
  const all: Array<Record<string, unknown>> = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let q = admin
      .from('customers')
      .select(
        'email, first_name, last_name, company_name, phone, is_business, migrated_from_bc, legacy_bc_customer_id, created_at',
      );
    if (search) {
      q = q.or(
        `email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`,
      );
    }
    const { data, error } = await q.order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) {
      console.error('[admin/customers/export]', error);
      return NextResponse.json({ error: 'query failed' }, { status: 500 });
    }
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }

  const columns = [
    'email', 'first_name', 'last_name', 'company_name', 'phone',
    'is_business', 'migrated_from_bc', 'legacy_bc_customer_id', 'created_at',
  ];
  const body = toCsv(all, columns);

  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${csvFilename('customers')}"`,
      'cache-control': 'no-store',
    },
  });
}
