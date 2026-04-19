import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · Admin' },
  robots: { index: false, follow: false },
};

const NAV = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/customers', label: 'Customers' },
  { href: '/admin/products', label: 'Products' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // The /admin/login page renders without the admin chrome.
  // Next.js nested layouts don't let us conditionally skip the layout,
  // so the login page's <section> renders inside this layout. That's
  // acceptable — the sidebar is visible on login but links require auth
  // to do anything, and the login page sizes itself.
  return (
    <div className="min-h-screen bg-paper">
      {/* Slim admin header */}
      <header
        className="bg-ink text-cream"
        style={{ padding: '14px 32px', borderBottom: '1px solid rgba(212, 169, 97, 0.25)' }}
      >
        <div className="max-w-content mx-auto flex items-center justify-between gap-6 max-sm:px-0">
          <Link href="/admin" className="flex items-center gap-3">
            <span
              className="font-display italic text-cream"
              style={{ fontSize: '20px', letterSpacing: '-0.01em', lineHeight: 1 }}
            >
              La Costa Gourmet
            </span>
            <span
              className="font-mono uppercase text-gold-bright"
              style={{ fontSize: '10px', letterSpacing: '0.26em' }}
            >
              Admin
            </span>
          </Link>
          <Link
            href="/api/admin/logout"
            className="font-mono uppercase text-cream/70 hover:text-cream transition-colors duration-200"
            style={{ fontSize: '10px', letterSpacing: '0.22em' }}
          >
            Sign out
          </Link>
        </div>
      </header>

      <div className="max-w-content mx-auto px-8 py-8 max-sm:px-5 max-sm:py-6">
        <div className="grid gap-8 max-lg:gap-5 lg:grid-cols-[200px_1fr]">
          {/* Sidebar */}
          <aside className="flex flex-col lg:sticky lg:top-6 self-start">
            <nav className="flex flex-col">
              {NAV.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="font-display text-ink hover:text-brand-deep transition-colors duration-200"
                  style={{
                    fontSize: '16px',
                    padding: '14px 8px',
                    borderBottom: '1px solid var(--rule)',
                    minHeight: 44,
                  }}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </aside>

          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
