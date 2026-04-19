import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getResend,
  VENDOR_EMAIL_FROM,
  VENDOR_EMAIL_REPLY_TO,
} from '@/lib/resend/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * /for-business inquiry submit endpoint.
 *
 * Flow:
 *   1. Per-IP rate limit (3 / hour). 429 if exceeded.
 *   2. Validate body with zod (mirrors the form constraints).
 *   3. Insert row in `inquiries` (this is the source of truth — even
 *      if the email send fails, the inquiry is captured).
 *   4. Email Jeff via Resend, reusing the same env var the vendor PO
 *      flow uses (REPLY_TO_EMAIL).
 *   5. If Resend errors, return success with warning='email_failed' so
 *      the visitor gets the same confirmation experience and Jeff can
 *      still see the inquiry in the admin inbox.
 */

const InquirySchema = z.object({
  name: z.string().trim().min(1).max(200),
  business_name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(254),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(30)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  volume_estimate: z
    .enum(['under-500', '500-2k', '2k-5k', '5k-plus'])
    .optional()
    .or(z.literal('').transform(() => undefined)),
  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

const RATE_LIMIT_PER_HOUR = 3;
const ONE_HOUR_MS = 60 * 60 * 1000;

const VOLUME_LABELS: Record<string, string> = {
  'under-500': 'Under $500 / month',
  '500-2k':    '$500 – $2,000 / month',
  '2k-5k':     '$2,000 – $5,000 / month',
  '5k-plus':   '$5,000+ / month',
};

function getClientIp(req: NextRequest): string | null {
  // Vercel sets x-forwarded-for and x-real-ip; behind any proxy use the
  // first hop in the X-F-F chain. Fallback to req.ip in dev.
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const xri = req.headers.get('x-real-ip');
  if (xri) return xri.trim();
  return req.ip ?? null;
}

export async function POST(req: NextRequest) {
  // ---- Parse + validate ---------------------------------------------------
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, errorMessage: 'Invalid request body' },
      { status: 400 },
    );
  }

  const parsed = InquirySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        errorMessage: 'Some fields look off — check name, business, and a valid email.',
      },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const ip = getClientIp(req);

  const admin = createAdminClient();

  // ---- Rate limit by IP ---------------------------------------------------
  if (ip) {
    const { data: rl } = await admin
      .from('inquiry_rate_limit')
      .select('attempt_count, window_start')
      .eq('ip', ip)
      .maybeSingle();

    if (rl) {
      const windowAge = Date.now() - new Date(rl.window_start).getTime();
      if (windowAge > ONE_HOUR_MS) {
        // window expired — reset
        await admin
          .from('inquiry_rate_limit')
          .update({ attempt_count: 1, window_start: new Date().toISOString() })
          .eq('ip', ip);
      } else if (rl.attempt_count >= RATE_LIMIT_PER_HOUR) {
        return NextResponse.json(
          {
            success: false,
            errorMessage:
              'Too many submissions from this address. Try again in an hour, or call (760) 931-1028.',
          },
          { status: 429 },
        );
      } else {
        await admin
          .from('inquiry_rate_limit')
          .update({ attempt_count: rl.attempt_count + 1 })
          .eq('ip', ip);
      }
    } else {
      // First attempt from this IP
      await admin.from('inquiry_rate_limit').insert({ ip, attempt_count: 1 });
    }
  }

  // ---- Insert (source of truth) -------------------------------------------
  const { data: inquiry, error: insErr } = await admin
    .from('inquiries')
    .insert({
      name: data.name,
      business_name: data.business_name,
      email: data.email,
      phone: data.phone ?? null,
      volume_estimate: data.volume_estimate ?? null,
      notes: data.notes ?? null,
      ip,
    })
    .select('id')
    .single();

  if (insErr || !inquiry) {
    console.error('[inquiries/submit] insert failed', insErr);
    return NextResponse.json(
      { success: false, errorMessage: 'We could not save your inquiry. Try again or call us.' },
      { status: 500 },
    );
  }

  // ---- Email Jeff via Resend ---------------------------------------------
  const subject = `New business inquiry — ${data.business_name}`;
  const volumeLabel = data.volume_estimate
    ? VOLUME_LABELS[data.volume_estimate] ?? data.volume_estimate
    : '(not specified)';

  const lines = [
    `Name: ${data.name}`,
    `Business: ${data.business_name}`,
    `Email: ${data.email}`,
    `Phone: ${data.phone ?? '(not provided)'}`,
    `Monthly volume estimate: ${volumeLabel}`,
    '',
    'Notes:',
    data.notes ?? '(none)',
    '',
    '—',
    `Inquiry id: ${inquiry.id}`,
    `Submitted from IP: ${ip ?? 'unknown'}`,
    `Review in admin: /admin/inquiries`,
  ];

  try {
    const resend = getResend();
    const result = await resend.emails.send({
      from: VENDOR_EMAIL_FROM,
      to: [VENDOR_EMAIL_REPLY_TO],
      replyTo: data.email,
      subject,
      text: lines.join('\n'),
    });
    if (result.error) {
      console.error('[inquiries/submit] resend error', result.error);
      return NextResponse.json({ success: true, warning: 'email_failed' });
    }
  } catch (e) {
    console.error('[inquiries/submit] resend threw', e);
    return NextResponse.json({ success: true, warning: 'email_failed' });
  }

  return NextResponse.json({ success: true });
}
