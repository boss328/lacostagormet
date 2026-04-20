'use client';

import { Menu } from 'lucide-react';

/**
 * Mobile-only hamburger button rendered inside the admin top rail.
 * Dispatches `admin:toggle-drawer`; the drawer state lives in
 * AdminSidebar, which listens for the same event.
 *
 * This is a small client leaf so AdminTopRail can stay a server
 * component.
 */
export function AdminDrawerToggle() {
  return (
    <button
      type="button"
      aria-label="Open admin navigation"
      onClick={() => {
        window.dispatchEvent(new CustomEvent('admin:toggle-drawer'));
      }}
      className="md:hidden text-cream hover:text-gold-bright transition-colors"
      style={{ padding: 6 }}
    >
      <Menu size={22} strokeWidth={1.5} />
    </button>
  );
}
