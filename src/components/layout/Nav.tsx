import Link from 'next/link';
import { Menu, Search, ShoppingBag, User } from 'lucide-react';

const NAV_LINKS: Array<{ href: string; label: string }> = [
  { href: '/shop/teas-and-chai', label: 'Teas' },
  { href: '/shop/cocoa-and-hot-drinks', label: 'Cocoa' },
  { href: '/shop/frappes-and-smoothies', label: 'Frappés' },
  { href: '/shop/syrups-and-sauces', label: 'Syrups' },
  { href: '/shop/smoothies', label: 'Smoothies' },
  { href: '/brand', label: 'Brands' },
  { href: '/for-business', label: 'For Business' },
];

export function Nav() {
  return (
    <nav className="bg-cream border-b border-rule px-8 max-sm:px-5 pt-6 pb-5">
      <div className="max-w-content mx-auto grid grid-cols-[auto_1fr_auto] items-center gap-10 max-lg:grid-cols-[auto_auto] max-lg:justify-between">
        {/* Wordmark + tagline */}
        <Link href="/" className="flex items-center gap-4 group">
          <span
            className="font-display italic leading-none text-brand-deep tracking-[-0.01em]"
            style={{ fontSize: '30px' }}
          >
            La Costa Gourmet
          </span>
          <span className="h-7 w-px bg-rule max-sm:hidden" aria-hidden="true" />
          <span className="type-label-sm text-ink-muted max-w-[180px] leading-tight max-sm:hidden">
            Purveyors of specialty café provisions
          </span>
        </Link>

        {/* Center nav links — desktop only */}
        <ul className="flex items-center justify-center gap-8 max-lg:hidden">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="nav-link type-label">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Utility column */}
        <div className="flex items-center gap-6 max-sm:gap-4">
          <button
            type="button"
            aria-label="Search"
            className="text-ink hover:text-brand-deep transition-colors duration-300 max-lg:hidden"
          >
            <Search size={18} strokeWidth={1.5} />
          </button>
          <Link
            href="/account"
            aria-label="Your account"
            className="text-ink hover:text-brand-deep transition-colors duration-300 max-lg:hidden"
          >
            <User size={18} strokeWidth={1.5} />
          </Link>
          <Link href="/cart" className="flex items-center gap-2.5" aria-label="Cart, 0 items">
            <ShoppingBag size={18} strokeWidth={1.5} className="text-ink" />
            <span className="bg-ink text-paper font-mono text-[10px] leading-none tracking-[0.18em] px-2.5 py-1.5">
              0
            </span>
          </Link>
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded="false"
            aria-controls="mobile-nav"
            className="lg:hidden text-ink"
          >
            <Menu size={20} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </nav>
  );
}
