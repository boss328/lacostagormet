import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Your account',
  robots: { index: false, follow: false },
};

const NAV_LINKS = [
  { href: '/account', label: 'Overview' },
  { href: '/account/orders', label: 'Orders' },
  { href: '/account/addresses', label: 'Addresses' },
  { href: '/account/settings', label: 'Settings' },
];

/**
 * Server-side guard: if there's no Supabase session, bounce to /login.
 * Middleware already enforces the same gate, but the layout-level check
 * is defence in depth — a server component rendering /account/* without
 * a user would otherwise crash on the downstream getSessionUser() calls.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <section className="max-w-content mx-auto px-8 py-14 max-sm:px-5 max-sm:py-10">
      <div className="grid gap-12 max-lg:gap-8 lg:grid-cols-[220px_1fr]">
        <aside className="flex flex-col gap-1 lg:sticky lg:top-6 self-start">
          <p className="type-label text-accent mb-4">§ Your account</p>
          <p
            className="type-data-mono text-ink-muted mb-4 truncate"
            title={user.email ?? ''}
          >
            {user.email}
          </p>
          <nav className="flex flex-col">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="type-label text-ink hover:text-brand-deep transition-colors duration-200 py-3"
                style={{ borderBottom: '1px solid var(--rule)' }}
              >
                {link.label}
              </Link>
            ))}
            <form method="POST" action="/auth/sign-out" className="py-3">
              <button
                type="submit"
                className="type-label text-ink-muted hover:text-accent transition-colors duration-200"
              >
                Sign out
              </button>
            </form>
          </nav>
        </aside>
        <div>{children}</div>
      </div>
    </section>
  );
}
