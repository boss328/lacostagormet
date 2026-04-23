import Link from 'next/link';
import Image from 'next/image';
import { AdminSearchTrigger } from '@/components/admin/AdminSearchTrigger';
import { AdminDrawerToggle } from '@/components/admin/AdminDrawerToggle';
import logo from '../../../public/logo.png';

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
      <div className="max-w-[1600px] mx-auto grid items-center gap-6 px-6 py-3 max-md:gap-3 max-md:px-4 max-md:grid-cols-[auto_1fr_auto] lg:grid-cols-[auto_1fr_auto]">
        <AdminDrawerToggle />
        <Link href="/admin/" className="flex items-center gap-4 shrink-0 max-md:gap-2">
          {/* Coloured wordmark on the dark admin rail — sit it on a
              cream plaque so the purple + teal read against the ink bg.
              No invert filter; the logo ships with its own colours. */}
          <span
            className="inline-block"
            style={{
              background: 'var(--color-cream)',
              padding: '4px 8px',
              borderRadius: 2,
            }}
          >
            <Image
              src={logo}
              alt="La Costa Gourmet"
              priority
              sizes="(max-width: 640px) 96px, 170px"
              placeholder="blur"
              className="h-7 max-sm:h-6 w-auto block"
            />
          </span>
          <span
            className="font-mono uppercase text-gold-bright"
            style={{ fontSize: '10px', letterSpacing: '0.26em' }}
          >
            Command
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
