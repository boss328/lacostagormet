'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, Search, User, X, ChevronDown } from 'lucide-react';
import { CartBadge } from './CartBadge';
import { COLLECTIONS } from '@/lib/collections';

export function Nav() {
  const [mobile, setMobile] = useState(false);
  const [categories, setCategories] = useState(false);
  const pathname = usePathname();
  const toggle = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  const close = () => {
    setMobile(false);
    setCategories(false);
  };
  useEffect(close, [pathname]);
  useEffect(() => {
    function escape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (categories) toggle.current?.focus();
        else if (mobile) menu.current?.focus();
        setCategories(false);
        setMobile(false);
      }
    }
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [categories, mobile]);
  return (
    <header className="site-header">
      <div className="nav-inner wrap">
        <Link href="/" onClick={close} aria-label="La Costa Gourmet home">
          <Image
            src="/storefront/logo-green-purple.png"
            alt="La Costa Gourmet"
            width={1200}
            height={564}
            priority
            className="site-logo"
          />
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          <Link href="/shop">Shop all</Link>
          <div
            className="nav-category-group"
            onMouseEnter={() => setCategories(true)}
            onMouseLeave={() => setCategories(false)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node))
                setCategories(false);
            }}
          >
            <button
              ref={toggle}
              type="button"
              aria-expanded={categories}
              aria-controls="category-menu"
              onClick={() => setCategories(!categories)}
            >
              Categories <ChevronDown size={14} />
            </button>
            {categories && (
              <div id="category-menu" className="mega-menu">
                <div className="wrap">
                  <div className="section-heading">
                    <h2>Find your favorite.</h2>
                    <Link href="/shop" onClick={close} className="text-link">
                      Shop all products →
                    </Link>
                  </div>
                  <div className="mega-grid">
                    {COLLECTIONS.map((c) => (
                      <Link
                        key={c.slug}
                        href={`/shop/${c.slug}`}
                        onClick={close}
                      >
                        <Image
                          src={`/storefront/${c.image}.webp`}
                          alt=""
                          width={64}
                          height={64}
                        />
                        <span>{c.name}</span>
                        <span aria-hidden="true">›</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          <Link href="/brand">Brands</Link>
          <Link href="/for-business">For business</Link>
          <Link href="/contact">Help</Link>
        </nav>
        <div className="nav-actions">
          <Link
            className="icon-button"
            href="/search"
            aria-label="Search products"
          >
            <Search size={20} />
          </Link>
          <Link
            className="icon-button account-icon"
            href="/account"
            aria-label="Your account"
          >
            <User size={20} />
          </Link>
          <CartBadge />
          <button
            ref={menu}
            className="icon-button mobile-menu-toggle"
            aria-label={mobile ? 'Close menu' : 'Open menu'}
            aria-expanded={mobile}
            aria-controls="mobile-nav"
            onClick={() => setMobile(!mobile)}
          >
            {mobile ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
      {mobile && (
        <nav
          id="mobile-nav"
          className="mobile-nav wrap"
          aria-label="Mobile navigation"
        >
          <Link href="/shop" onClick={close}>
            Shop all products
          </Link>
          <details>
            <summary>Categories</summary>
            {COLLECTIONS.map((c) => (
              <Link key={c.slug} href={`/shop/${c.slug}`} onClick={close}>
                {c.name}
              </Link>
            ))}
          </details>
          <Link href="/brand" onClick={close}>
            Brands
          </Link>
          <Link href="/for-business" onClick={close}>
            For business
          </Link>
          <Link href="/account" onClick={close}>
            Your account
          </Link>
          <Link href="/contact" onClick={close}>
            Contact & help
          </Link>
        </nav>
      )}
    </header>
  );
}
