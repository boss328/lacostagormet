'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Sidebar nav — roman-numeraled editorial list. Active row picks up a
 * left accent bar + brand-deep tint. Paired with g-prefix keyboard
 * shortcuts handled by AdminShortcuts (g d / g o / g c / g p / g i).
 *
 * Mobile drawer: below md, the sidebar hides itself from the normal
 * flow (hidden) and toggles into a fixed-position overlay when the
 * `admin:toggle-drawer` event fires (dispatched from AdminDrawerToggle
 * in the top rail). Tapping a nav link, the backdrop, or Escape closes
 * it. Desktop keeps the existing sticky sidebar positioning.
 */

type NavItem = { href: string; label: string; numeral: string; shortcut: string };

// Every href carries a trailing slash because next.config.mjs sets
// trailingSlash: true. Without it, each Link click triggers a 308 from
// Vercel's edge — and on the in-flight 308 the lcg_admin cookie wasn't
// reliably surviving the hop on Vercel's network, causing the user to
// bounce back to /admin/login on every nav click. See commit body.
const NAV: NavItem[] = [
  { href: '/admin/',                 label: 'Dashboard',       numeral: 'I',     shortcut: 'g d' },
  { href: '/admin/orders/',          label: 'Orders',          numeral: 'II',    shortcut: 'g o' },
  { href: '/admin/customers/',       label: 'Customers',       numeral: 'III',   shortcut: 'g c' },
  { href: '/admin/products/',        label: 'Products',        numeral: 'IV',    shortcut: 'g p' },
  { href: '/admin/vendors/',         label: 'Vendors',         numeral: 'V',     shortcut: 'g v' },
  { href: '/admin/purchase-orders/', label: 'Purchase Orders', numeral: 'VI',    shortcut: 'g u' },
  { href: '/admin/inquiries/',       label: 'Inquiries',       numeral: 'VII',   shortcut: 'g n' },
  { href: '/admin/imports/',         label: 'Imports',         numeral: 'VIII',  shortcut: 'g i' },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Listen for toggle events from AdminDrawerToggle
  useEffect(() => {
    function onToggle() {
      setDrawerOpen((v) => !v);
    }
    function onClose() {
      setDrawerOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrawerOpen(false);
    }
    window.addEventListener('admin:toggle-drawer', onToggle);
    window.addEventListener('admin:close-drawer', onClose);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('admin:toggle-drawer', onToggle);
      window.removeEventListener('admin:close-drawer', onClose);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // Close the drawer whenever the user navigates — if pathname changes
  // while the drawer is open (after tapping a Link), slide it closed.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Lock body scroll while the mobile drawer is open
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    if (drawerOpen) document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  return (
    <>
      {/* Mobile backdrop — click anywhere to dismiss */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: 'rgba(26, 17, 10, 0.55)' }}
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          // Desktop: sticky sidebar as before
          'lg:sticky lg:top-6 self-start',
          // Tablet (md-lg): stay in normal flow above main content
          'md:block',
          // Mobile: fixed overlay drawer, off-screen when closed
          'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:w-[280px]',
          'max-md:bg-paper max-md:px-5 max-md:py-6 max-md:overflow-y-auto',
          'max-md:border-r max-md:border-rule-strong',
          'max-md:transition-transform max-md:duration-300 max-md:ease-out',
          drawerOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full',
        ].join(' ')}
      >
        <p
          className="type-label text-ink-muted mb-4 max-md:mb-3"
          style={{ paddingLeft: 4 }}
        >
          § Navigation
        </p>
        <nav className="flex flex-col">
          {NAV.map((item) => {
            // Dashboard is exact-match only — startsWith would mark it
            // active on every admin route. All other items match their
            // subtree via startsWith.
            const active =
              item.href === '/admin/'
                ? pathname === '/admin/' || pathname === '/admin'
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setDrawerOpen(false)}
                className="group relative flex items-baseline gap-3 transition-colors duration-200"
                style={{
                  padding: '11px 10px',
                  borderBottom: '1px solid var(--rule)',
                  minHeight: 44,
                  background: active ? 'var(--color-cream)' : 'transparent',
                  color: active ? 'var(--color-ink)' : 'var(--color-ink-2)',
                }}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-0 bottom-0"
                    style={{ width: 2, background: 'var(--color-brand-deep)' }}
                  />
                )}
                <span
                  className="font-display italic shrink-0"
                  style={{
                    fontSize: '13px',
                    color: active ? 'var(--color-brand-deep)' : 'var(--color-ink-muted)',
                    fontWeight: 500,
                    width: 24,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {item.numeral}
                </span>
                <span
                  className="font-display flex-1"
                  style={{ fontSize: '15.5px', lineHeight: 1.3 }}
                >
                  {item.label}
                </span>
                <span
                  className="font-mono uppercase text-ink-muted opacity-0 group-hover:opacity-100 transition-opacity duration-200 max-md:hidden"
                  style={{ fontSize: '9px', letterSpacing: '0.2em' }}
                >
                  {item.shortcut}
                </span>
              </Link>
            );
          })}
        </nav>
        <Link
          href="/admin/settings/"
          onClick={() => setDrawerOpen(false)}
          className="type-data-mono text-ink-muted hover:text-brand-deep mt-6 block"
          style={{ paddingLeft: 4 }}
        >
          Settings →
        </Link>
        <p
          className="type-data-mono text-ink-muted mt-3 max-md:hidden"
          style={{ paddingLeft: 4, lineHeight: 1.5 }}
        >
          Press <span className="text-ink">?</span> for the full shortcut list.
        </p>
      </aside>
    </>
  );
}
