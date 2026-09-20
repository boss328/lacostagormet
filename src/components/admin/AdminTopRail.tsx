import Image from 'next/image';
import Link from 'next/link';
import { AdminDrawerToggle } from './AdminDrawerToggle';
import { AdminSearchTrigger } from './AdminSearchTrigger';
export function AdminTopRail() {
  return (
    <header className="admin-toprail">
      <div className="admin-toprail-inner">
        <div className="flex items-center gap-5">
          <AdminDrawerToggle />
          <Link href="/admin/">
            <Image
              src="/storefront/logo-green-purple.png"
              alt="La Costa Gourmet admin"
              width={150}
              height={70}
            />
          </Link>
          <span className="type-label text-ink-muted max-sm:hidden">
            Store management
          </span>
        </div>
        <div className="admin-toprail-actions">
          <AdminSearchTrigger />
          <Link href="/">View store ↗</Link>
          <Link href="/api/admin/logout/" prefetch={false}>
            Sign out
          </Link>
        </div>
      </div>
    </header>
  );
}
