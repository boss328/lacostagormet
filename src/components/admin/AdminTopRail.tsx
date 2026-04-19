import Link from 'next/link';
import { AdminSearchTrigger } from '@/components/admin/AdminSearchTrigger';

/**
 * Admin top rail — ink-dark editorial band.
 *
 * Left: La Costa italic wordmark + "§ La Costa Command" eyebrow.
 * Center: search trigger with Cmd+K hint (opens the command palette).
 * Right: keyboard-shortcut cheatsheet trigger (?) and sign-out link.
 */
export function AdminTopRail() {
  return (
    <header
      className="bg-ink text-cream"
      style={{
        borderBottom: '1px solid rgba(212, 169, 97, 0.2)',
      }}
    >
      <div className="max-w-[1600px] mx-auto grid items-center gap-6 px-6 py-3 max-sm:px-4 max-sm:grid-cols-[1fr_auto] lg:grid-cols-[auto_1fr_auto]">
        <Link href="/admin" className="flex items-center gap-4 shrink-0">
          <span
            className="font-display italic text-cream"
            style={{
              fontSize: '22px',
              lineHeight: 1,
              letterSpacing: '-0.015em',
              fontWeight: 500,
            }}
          >
            La Costa <em className="type-accent-gold">Command</em>
          </span>
          <span className="h-5 w-px bg-gold-bright/25 max-sm:hidden" aria-hidden="true" />
          <span
            className="font-mono uppercase text-gold-bright max-sm:hidden"
            style={{ fontSize: '10px', letterSpacing: '0.26em' }}
          >
            § Est. MMIII
          </span>
        </Link>

        <div className="max-lg:hidden">
          <AdminSearchTrigger />
        </div>

        <div className="flex items-center gap-5 shrink-0 max-sm:gap-3">
          <span
            className="font-mono uppercase text-cream/50 max-sm:hidden"
            style={{ fontSize: '9px', letterSpacing: '0.24em' }}
          >
            ⌘K · Type / to search · ? for shortcuts
          </span>
          <Link
            href="/api/admin/logout"
            className="font-mono uppercase text-cream/70 hover:text-gold-bright transition-colors duration-200"
            style={{ fontSize: '10px', letterSpacing: '0.22em' }}
          >
            Sign out
          </Link>
        </div>
      </div>
    </header>
  );
}
