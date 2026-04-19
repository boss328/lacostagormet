import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  retail_price: z.number().nonnegative(),
  wholesale_cost: z.number().nonnegative().nullable(),
  is_active: z.boolean(),
  is_featured: z.boolean(),
  stock_status: z.enum(['in_stock', 'out_of_stock', 'discontinued']),
  short_description: z.string().max(2000).optional().default(''),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let body;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    console.error('[admin product patch] validation', e);
    return NextResponse.json({ errorMessage: 'invalid body' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('products')
    .update({
      retail_price: body.retail_price,
      wholesale_cost: body.wholesale_cost,
      is_active: body.is_active,
      is_featured: body.is_featured,
      stock_status: body.stock_status,
      short_description: body.short_description,
    })
    .eq('id', params.id);

  if (error) {
    console.error('[admin product patch] update', error);
    return NextResponse.json({ errorMessage: 'update failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
