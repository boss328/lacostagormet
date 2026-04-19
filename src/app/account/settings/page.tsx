import Link from 'next/link';
import { getSessionUser } from '@/lib/supabase/auth-helpers';

export const dynamic = 'force-dynamic';

export default async function AccountSettingsPage() {
  const user = await getSessionUser();
  const email = user?.email ?? '';

  return (
    <>
      <header className="mb-10">
        <p className="type-label text-accent mb-5">§ Your settings</p>
        <h1 className="type-display-2">
          Account <em className="type-accent">details</em>.
        </h1>
      </header>

      <div
        className="bg-cream mb-6"
        style={{ border: '1px solid var(--rule-strong)', padding: '24px 26px' }}
      >
        <p className="type-label text-ink mb-4">§&nbsp;&nbsp;Email on file</p>
        <p className="type-product text-ink">{email}</p>
        <p className="type-data-mono text-ink-muted mt-3">
          Magic-link sign-in uses this address. Email change is coming in a later
          update.
        </p>
      </div>

      <div
        className="bg-cream mb-6"
        style={{ border: '1px solid var(--rule-strong)', padding: '24px 26px' }}
      >
        <p className="type-label text-ink mb-4">§&nbsp;&nbsp;Marketing preferences</p>
        <p className="type-body" style={{ fontSize: '15px', lineHeight: 1.55 }}>
          We don&rsquo;t send marketing email yet. When we do, you&rsquo;ll be able
          to opt in here.
        </p>
      </div>

      <Link
        href="/auth/signout"
        className="btn btn-outline justify-center"
        style={{ padding: '14px 22px' }}
      >
        <span>Sign out</span>
        <span className="btn-arrow" aria-hidden="true">→</span>
      </Link>
    </>
  );
}
