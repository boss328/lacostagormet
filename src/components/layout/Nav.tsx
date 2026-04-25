'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, Search, User, X, ShoppingBag } from 'lucide-react';
import { CartBadge } from '@/components/layout/CartBadge';
import logo from '../../../public/logo.png';

const NAV_LINKS: Array<{ href: string; label: string }> = [
  { href: '/shop/chai-tea', label: 'Chai Tea' },
  { href: '/shop/specialty-beverages', label: 'Specialty' },
  { href: '/shop/smoothies', label: 'Smoothies' },
  { href: '/shop/oatmeal', label: 'Oatmeal' },
  { href: '/shop/protein-and-energy', label: 'Protein' },
  { href: '/brand', label: 'Brands' },
  { href: '/for-business', label: 'For Business' },
];

export function Nav() {
  const [isOpen, setIsOpen] = useState(false);

  // Escape key closes the drawer; body scroll locks while it's open.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    if (isOpen) document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const close = () => setIsOpen(false);

  return (
    <nav className="bg-cream border-b border-rule px-8 max-md:px-5 pt-6 pb-5 max-md:pt-3 max-md:pb-3 relative z-40">
        <div className="max-w-content mx-auto grid grid-cols-[auto_1fr_auto] items-center gap-10 max-lg:grid-cols-[auto_auto] max-lg:justify-between max-md:gap-4">
          {/* Logo wordmark + tagline */}
          <Link href="/" className="flex items-center gap-4 group" onClick={close}>
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
              aria-label={isOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isOpen}
              aria-controls="mobile-nav"
              onClick={() => setIsOpen((v) => !v)}
              className="lg:hidden text-ink hover:text-brand-deep transition-colors"
            >
              {isOpen ? <X size={22} strokeWidth={1.5} /> : <Menu size={20} strokeWidth={1.5} />}
          </button>
        </div>
      </div>

      {/* Mobile drawer backdrop — fixed covers the whole viewport below
          the nav; tap anywhere outside to close. */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          style={{ background: 'rgba(26, 17, 10, 0.55)' }}
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer — positioned absolute within the nav so it opens
          directly below the nav bar (top-full). nav is position:relative
          so this anchors correctly regardless of nav height. */}
      <div
        id="mobile-nav"
        className={[
          'lg:hidden absolute top-full left-0 right-0 z-40 bg-cream border-b border-rule-strong',
          'transition-[opacity,transform] duration-200 ease-out',
          isOpen
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 -translate-y-2 pointer-events-none',
        ].join(' ')}
        style={{ maxHeight: 'calc(100vh - 4rem)', overflowY: 'auto' }}
      >
        <ul className="max-w-content mx-auto px-5 py-2">
          {NAV_LINKS.map((link) => (
            <li
              key={link.href}
              style={{ borderBottom: '1px solid var(--rule)' }}
            >
              <Link
                href={link.href}
                onClick={close}
                className="block py-4 font-display italic text-brand-deep hover:text-ink transition-colors"
                style={{ fontSize: '20px', lineHeight: 1.1, letterSpacing: '-0.01em', fontWeight: 500 }}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="max-w-content mx-auto px-5 py-4 flex items-center gap-6">
          <Link
            href="/account"
            onClick={close}
            className="flex items-center gap-2 type-label text-ink hover:text-brand-deep transition-colors"
          >
            <User size={16} strokeWidth={1.5} />
            Account
          </Link>
          <Link
            href="/cart"
            onClick={close}
            className="flex items-center gap-2 type-label text-ink hover:text-brand-deep transition-colors"
          >
            <ShoppingBag size={16} strokeWidth={1.5} />
            Cart
          </Link>
        </div>
      </div>
    </nav>
  );
}
