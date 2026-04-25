import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendTransactionalEmail } from '@/lib/email/send';
import {
  renderAbandonedCart,
  type AbandonedCartItem,
} from '@/lib/email/templates/abandoned-cart';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cron-driven abandoned cart reminder sender.
 *
 * Vercel Cron POSTs (or GETs) here on the schedule defined in
 * vercel.json. Auth: caller must include
 *   Authorization: Bearer ${CRON_SECRET}
 * Vercel Cron sends this header automatically once CRON_SECRET is
 * configured in project env. Local-machine invocations are blocked
 * unless the same header is supplied.
 *
 * Two passes per invocation:
 *   1. First reminder  — carts idle >4 hours, never reminded.
 *   2. Second reminder — first reminder sent >24 hours ago,
 *                        still no recovery, still idle.
 *
 * No third reminder; per spec, two emails is the cap.
 *
 * Each pass batches up to BATCH_SIZE rows so a single hourly tick
 * can't blow Resend rate limits even after a backfill.
 */

const BATCH_SIZE = 50;
const FIRST_REMINDER_AGE_HOURS = 4;
const SECOND_REMINDER_AGE_HOURS = 24;

type CartRow = {
  id: string;
  email: string;
  cart_contents: AbandonedCartItem[];
  subtotal_cents: number;
  unsubscribe_token: string;
  reminder_sent_count: number;
};

async function handle(req: NextRequest) {
  // Auth gate.
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET not configured' },
      { status: 503 },
    );
  }
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();

  const firstCutoff = new Date(now.getTime() - FIRST_REMINDER_AGE_HOURS * 3600_000).toISOString();
  const secondLastReminderCutoff = new Date(
    now.getTime() - SECOND_REMINDER_AGE_HOURS * 3600_000,
  ).toISOString();

  const stats = { firstSent: 0, firstFailed: 0, secondSent: 0, secondFailed: 0 };

  // ------- Pass 1: first reminder ------------------------------------------
  const { data: firstBatch, error: firstErr } = await admin
    .from('abandoned_carts')
    .select('id, email, cart_contents, subtotal_cents, unsubscribe_token, reminder_sent_count')
    .is('recovered_at', null)
    .is('unsubscribed_at', null)
    .eq('reminder_sent_count', 0)
    .lt('last_updated_at', firstCutoff)
    .limit(BATCH_SIZE);

  if (firstErr) {
    if (firstErr.code === '42P01') {
      return NextResponse.json(
        { ok: false, error: 'abandoned_carts table missing — run migration 0011' },
        { status: 503 },
      );
    }
    console.error('[cron/abandoned-cart] pass-1 query failed', firstErr);
    return NextResponse.json({ ok: false, error: 'pass1_query_failed' }, { status: 500 });
  }

  for (const row of (firstBatch ?? []) as CartRow[]) {
    const ok = await sendReminder(row, 1);
    if (ok) {
      stats.firstSent += 1;
      await admin
        .from('abandoned_carts')
        .update({
          reminder_sent_count: 1,
          last_reminder_sent_at: new Date().toISOString(),
        })
        .eq('id', row.id);
    } else {
      stats.firstFailed += 1;
    }
  }

  // ------- Pass 2: second reminder -----------------------------------------
  const { data: secondBatch, error: secondErr } = await admin
    .from('abandoned_carts')
    .select('id, email, cart_contents, subtotal_cents, unsubscribe_token, reminder_sent_count')
    .is('recovered_at', null)
    .is('unsubscribed_at', null)
    .eq('reminder_sent_count', 1)
    .lt('last_reminder_sent_at', secondLastReminderCutoff)
    .lt('last_updated_at', secondLastReminderCutoff)
    .limit(BATCH_SIZE);

  if (secondErr) {
    console.error('[cron/abandoned-cart] pass-2 query failed', secondErr);
    return NextResponse.json(
      { ok: true, stats, warning: 'pass2_query_failed' },
      { status: 200 },
    );
  }

  for (const row of (secondBatch ?? []) as CartRow[]) {
    const ok = await sendReminder(row, 2);
    if (ok) {
      stats.secondSent += 1;
      await admin
        .from('abandoned_carts')
        .update({
          reminder_sent_count: 2,
          last_reminder_sent_at: new Date().toISOString(),
        })
        .eq('id', row.id);
    } else {
      stats.secondFailed += 1;
    }
  }

  return NextResponse.json({ ok: true, stats });
}

async function sendReminder(row: CartRow, reminderNumber: 1 | 2): Promise<boolean> {
  const items = Array.isArray(row.cart_contents) ? row.cart_contents : [];
  if (items.length === 0) return false;

  const tpl = renderAbandonedCart({
    cartId: row.id,
    unsubscribeToken: row.unsubscribe_token,
    items,
    subtotalCents: row.subtotal_cents,
    reminderNumber,
  });

  const result = await sendTransactionalEmail({
    to: row.email,
    subject: reminderNumber === 1 ? 'You left something behind' : 'Still saved — your cart at La Costa Gourmet',
    html: tpl.html,
    text: tpl.text,
    tags: [
      { name: 'type', value: 'abandoned_cart' },
      { name: 'reminder_number', value: String(reminderNumber) },
    ],
  });

  return result.ok;
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
