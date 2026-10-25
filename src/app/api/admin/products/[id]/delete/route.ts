import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ADMIN_COOKIE, expectedSessionToken } from '@/lib/admin/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/products/[id]/delete/
 *
 * Hard-delete a product if it has zero historical references in
 * order_items. Otherwise soft-deactivate (is_active = false) so the
 * order history stays intact and customers can still click through
 * to a "no longer carried" product page.
 *
 * Cascades on hard delete:
 *   • product_images   ON DELETE CASCADE (FK)
 *   • product_categories ON DELETE CASCADE (FK)
 *   • order_items      ON DELETE SET NULL — but we don't get here if
 *                      any order_items reference the product, so this
 *                      branch is unreachable in the hard-delete path.
 *
 * Returns:
 *   { ok: true, deleted: true }       — hard delete succeeded
 *   { ok: true, deactivated: true }   — product had order history,
 *                                       was hidden instead
 *   { ok: false, errorMessage }       — anything else
 */
const PACK_GROUP_DELETE_MESSAGE =
  'This product has pack options. Turn off its Active setting to hide it, or remove its pack options before deleting the original product.';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const productId = params.id;

  // ── Auth re-check ──────────────────────────────────────────────────
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  const expected = await expectedSessionToken();
  if (!expected) {
    return NextResponse.json(
      { ok: false, errorMessage: 'Server misconfigured.' },
      { status: 503 },
    );
  }
  if (cookie !== expected) {
    return NextResponse.json({ ok: false, errorMessage: 'Not authenticated.' }, { status: 401 });
  }

  const admin = createAdminClient();

  // ── Confirm product exists ─────────────────────────────────────────
  const { data: product, error: existsErr } = await admin
    .from('products')
    .select('id, name')
    .eq('id', productId)
    .maybeSingle();
  if (existsErr) {
    console.error('[products/delete] lookup failed', existsErr);
    return NextResponse.json({ ok: false, errorMessage: 'Lookup failed.' }, { status: 500 });
  }
  if (!product) {
    return NextResponse.json({ ok: false, errorMessage: 'Product not found.' }, { status: 404 });
  }

  // A family root must remain available as the grouping anchor even if its
  // original pack is hidden from customers. Include inactive/deleted options:
  // the self-reference FK still protects those records from hard deletion.
  const { count: packCount, error: packCountErr } = await admin
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('pack_parent_id', productId);
  if (packCountErr) {
    console.error('[products/delete] pack option count failed', packCountErr);
    return NextResponse.json(
      { ok: false, errorMessage: 'Could not check linked pack options. Please try again.' },
      { status: 500 },
    );
  }
  if ((packCount ?? 0) > 0) {
    return NextResponse.json({ ok: false, errorMessage: PACK_GROUP_DELETE_MESSAGE }, { status: 409 });
  }

  // ── Order history check ────────────────────────────────────────────
  const { count: orderCount, error: countErr } = await admin
    .from('order_items')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId);

  if (countErr) {
    console.error('[products/delete] order count failed', countErr);
    return NextResponse.json(
      { ok: false, errorMessage: 'Order history check failed.' },
      { status: 500 },
    );
  }

  if ((orderCount ?? 0) > 0) {
    // Soft path: hide from storefront, keep the row + images + history.
    const { error: deactErr } = await admin
      .from('products')
      .update({ is_active: false })
      .eq('id', productId);
    if (deactErr) {
      console.error('[products/delete] deactivate failed', deactErr);
      return NextResponse.json(
        { ok: false, errorMessage: 'Could not hide product.' },
        { status: 500 },
      );
    }
    return NextResponse.json({
      ok: true,
      deactivated: true,
      message: `Product has ${orderCount} order line item(s) on record. Hidden from storefront instead of deleted so order history stays intact.`,
    });
  }

  // ── Hard delete path ───────────────────────────────────────────────
  // FKs cascade product_images and product_categories. We don't try
  // to clean up the storage bucket — orphan images are cheap and a
  // future GC pass can sweep them by diffing bucket vs DB.
  const { error: delErr } = await admin.from('products').delete().eq('id', productId);
  if (delErr) {
    console.error('[products/delete] delete failed', delErr);
    // A new option can be created after the count above. The FK closes that
    // race; translate its refusal rather than exposing database internals.
    if (delErr.code === '23503') {
      return NextResponse.json({
        ok: false,
        errorMessage: delErr.message?.includes('products_pack_parent_id_fkey')
          ? PACK_GROUP_DELETE_MESSAGE
          : 'This product is linked to another record. Turn off its Active setting to hide it instead of deleting it.',
      }, { status: 409 });
    }
    return NextResponse.json(
      { ok: false, errorMessage: 'Could not delete product. Please try again.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, deleted: true });
}
