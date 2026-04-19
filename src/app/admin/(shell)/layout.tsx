import Link from 'next/link';
import type { Metadata } from 'next';
import { AdminTopRail } from '@/components/admin/AdminTopRail';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminShortcuts } from '@/components/admin/AdminShortcuts';
import { CommandPalette } from '@/components/admin/CommandPalette';

export const metadata: Metadata = {
  title: { default: 'Command', template: '%s · La Costa Command' },
  robots: { index: false, follow: false },
};

/**
 * Admin shell — editorial command center.
 *
 * Structure:
 *   ┌──────────────────────────────────────────────────┐
 *   │ TopRail: La Costa / § Admin / shortcuts / signout │
 *   ├─────────┬────────────────────────────────────────┤
 *   │ Sidebar │ Main                                    │
 *   │  § I    │                                         │
 *   │  § II   │  Page content                           │
 *   │  § III  │                                         │
 *   └─────────┴────────────────────────────────────────┘
 *
 * Client components mounted once at the layout level: AdminShortcuts
 * (g-prefix key nav + / focus search) and CommandPalette (Cmd+K fuzzy
 * search + actions). Both live outside the flex grid so they don't
 * affect layout.
 */
export default function AdminShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <AdminTopRail />
      <div className="max-w-[1600px] mx-auto px-6 py-6 max-sm:px-4 max-sm:py-5">
        <div className="grid gap-8 max-lg:gap-5 lg:grid-cols-[220px_1fr]">
          <AdminSidebar />
          <main className="min-w-0">{children}</main>
        </div>
      </div>
      <AdminShortcuts />
      <CommandPalette />
      <footer className="border-t border-rule mt-12 py-6">
        <div className="max-w-[1600px] mx-auto px-6 flex items-center justify-between max-sm:px-4 max-sm:flex-col max-sm:gap-3">
          <p className="type-data-mono text-ink-muted">
            Est. MMIII · Carlsbad, CA · La Costa Command · № 0042 · Vol. XXII
          </p>
          <Link
            href="/"
            className="type-data-mono text-ink-muted hover:text-brand-deep transition-colors duration-200"
          >
            View storefront →
          </Link>
        </div>
      </footer>
    </div>
  );
}
