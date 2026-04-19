'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Sidebar nav — roman-numeraled editorial list. Active row picks up a
 * left accent bar + brand-deep tint. Paired with g-prefix keyboard
 * shortcuts handled by AdminShortcuts (g d / g o / g c / g p / g i).
 */

type NavItem = { href: string; label: string; numeral: string; shortcut: string };

const NAV: NavItem[] = [
  { href: '/admin',           label: 'Dashboard', numeral: 'I',   shortcut: 'g d' },
  { href: '/admin/orders',    label: 'Orders',    numeral: 'II',  shortcut: 'g o' },
  { href: '/admin/customers', label: 'Customers', numeral: 'III', shortcut: 'g c' },
  { href: '/admin/products',  label: 'Products',  numeral: 'IV',  shortcut: 'g p' },
  { href: '/admin/imports',   label: 'Imports',   numeral: 'V',   shortcut: 'g i' },
];

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <aside className="lg:sticky lg:top-6 self-start">
      <p
        className="type-label text-ink-muted mb-4"
        style={{ paddingLeft: 4 }}
      >
        § Navigation
      </p>
      <nav className="flex flex-col">
        {NAV.map((item) => {
          const active =
            item.href === '/admin'
              ? pathname === '/admin'
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
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
                className="font-mono uppercase text-ink-muted opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{ fontSize: '9px', letterSpacing: '0.2em' }}
              >
                {item.shortcut}
              </span>
            </Link>
          );
        })}
      </nav>
      <p
        className="type-data-mono text-ink-muted mt-6"
        style={{ paddingLeft: 4, lineHeight: 1.5 }}
      >
        Press <span className="text-ink">?</span> for the full shortcut list.
      </p>
    </aside>
  );
}
