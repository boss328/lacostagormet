import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { SettingsForm } from '@/components/admin/settings/SettingsForm';

export const dynamic = 'force-dynamic';

const KEYS = [
  'vendor_po.auto_draft',
  'vendor_po.default_reply_to',
  'vendor_po.signature',
  'vendor_po.attach_csv',
] as const;

type SettingsRow = {
  key: string;
  value: unknown;
};

export default async function SettingsPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from('settings')
    .select('key, value')
    .in('key', KEYS as unknown as string[]);
  const rows = (data ?? []) as SettingsRow[];
  const map: Record<string, string> = {};
  for (const r of rows) {
    const v = typeof r.value === 'string' ? r.value : JSON.stringify(r.value);
    map[r.key] = v;
  }

  return (
    <>
      <Link
        href="/admin/"
        className="type-label text-ink-muted hover:text-brand-deep transition-colors duration-200 inline-block mb-5"
      >
        ← Dashboard
      </Link>
      <header className="mb-8 pb-6" style={{ borderBottom: '1px solid var(--rule-strong)' }}>
        <p className="type-label text-accent mb-3">§ Settings</p>
        <h1
          className="font-display text-ink"
          style={{ fontSize: '40px', lineHeight: 1, letterSpacing: '-0.026em' }}
        >
          The <em className="type-accent">controls</em>.
        </h1>
      </header>

      <SettingsForm
        initial={{
          autoDraft: parseBool(map['vendor_po.auto_draft'] ?? 'true'),
          replyTo: stripQuotes(map['vendor_po.default_reply_to'] ?? '') || (process.env.REPLY_TO_EMAIL ?? ''),
          signature:
            stripQuotes(map['vendor_po.signature'] ?? '') ||
            'Thanks,\nLa Costa Gourmet\n(760) 931-1028',
          attachCsv: parseBool(map['vendor_po.attach_csv'] ?? 'false'),
        }}
      />
    </>
  );
}

function parseBool(v: string): boolean {
  const s = v.replace(/^"|"$/g, '');
  return s === 'true' || s === '1';
}

function stripQuotes(v: string): string {
  return v.replace(/^"|"$/g, '');
}
