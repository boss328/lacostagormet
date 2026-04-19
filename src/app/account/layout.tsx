import Link from 'next/link';
import type { Metadata } from 'next';

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

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <section className="max-w-content mx-auto px-8 py-14 max-sm:px-5 max-sm:py-10">
      <div className="grid gap-12 max-lg:gap-8 lg:grid-cols-[220px_1fr]">
        <aside className="flex flex-col gap-1 lg:sticky lg:top-6 self-start">
          <p className="type-label text-accent mb-4">§ Your account</p>
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
            <Link
              href="/auth/signout"
              className="type-label text-ink-muted hover:text-accent transition-colors duration-200 py-3"
            >
              Sign out
            </Link>
          </nav>
        </aside>
        <div>{children}</div>
      </div>
    </section>
  );
}
