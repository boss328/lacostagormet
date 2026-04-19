import Link from 'next/link';
import Image from 'next/image';
import { Menu, Search, User } from 'lucide-react';
import { CartBadge } from '@/components/layout/CartBadge';
import logo from '../../../public/brand/logo.png';

const NAV_LINKS: Array<{ href: string; label: string }> = [
  { href: '/shop/teas-and-chai', label: 'Teas' },
  { href: '/shop/cocoa', label: 'Cocoa' },
  { href: '/shop/frappes', label: 'Frappés' },
  { href: '/shop/syrups-and-sauces', label: 'Syrups' },
  { href: '/shop/smoothie-bases', label: 'Smoothies' },
  { href: '/brand', label: 'Brands' },
  { href: '/for-business', label: 'For Business' },
];

export function Nav() {
  return (
    <nav className="bg-cream border-b border-rule px-8 max-sm:px-5 pt-6 pb-5">
      <div className="max-w-content mx-auto grid grid-cols-[auto_1fr_auto] items-center gap-10 max-lg:grid-cols-[auto_auto] max-lg:justify-between">
        {/* Logo wordmark + tagline */}
        <Link href="/" className="flex items-center gap-4 group">
          <Image
            src={logo}
            alt="La Costa Gourmet"
            priority
            sizes="(max-width: 640px) 144px, 210px"
            placeholder="blur"
            className="h-12 max-sm:h-9 w-auto"
          />
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
          <CartBadge />
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
