'use client';

import { usePathname } from 'next/navigation';

/**
 * Gates the storefront chrome (TopRail / Nav / Footer) out of the /admin
 * surface. The root layout renders chrome for every route, but the admin
 * shell brings its own top rail, sidebar, and footer — so without this
 * gate every admin page stacked TWO headers (storefront ticker + logo nav
 * above the admin Command rail) and two footers, which on mobile ate half
 * the viewport and read as the logo overlapping the header.
 *
 * Children are server-rendered slots; this component only decides whether
 * to show them, and usePathname() resolves during SSR so admin pages never
 * flash the storefront chrome.
 */
export function StorefrontChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return null;
  return <>{children}</>;
}
