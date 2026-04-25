import { Fragment } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import logo from '../../../public/brand/logo.png';

const SHOP_LINKS = [
  { href: '/shop', label: 'All Products' },
  { href: '/brand', label: 'Brands' },
  { href: '/shop?sort=new', label: 'New Arrivals' },
  { href: '/shop', label: 'Categories' },
  { href: '/for-business', label: 'For Business' },
];

const SERVICE_LINKS = [
  { href: '/contact', label: 'Contact' },
  { href: '/shipping', label: 'Shipping' },
  { href: '/account', label: 'Your Account' },
  { href: '/account/orders', label: 'Track Order' },
  { href: '/returns', label: 'Returns' },
];

const TRUST_BADGES = ['Trustwave Secured', 'Authorize.Net Verified', 'HTTPS 256-bit', 'PCI Compliant'];

export function Footer() {
  return (
    <footer className="bg-ink text-paper relative pt-16 pb-6 px-8 max-md:px-5 max-md:pt-10 overflow-x-hidden">
      {/* Gold gradient top border */}
      <div
        className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, var(--color-gold) 50%, transparent 100%)',
        }}
        aria-hidden="true"
      />

      <div className="max-w-content mx-auto">
        {/* 4-column top */}
        <div
          className="grid gap-12 pb-10 max-lg:grid-cols-2 max-md:grid-cols-1 max-md:gap-8 max-md:pb-6"
          style={{ gridTemplateColumns: '1.4fr 1fr 1fr 1.3fr', borderBottom: '1px solid rgba(246, 238, 222, 0.14)' }}
        >
          {/* Brand block */}
          <div>
            {/* New brand logo (purple + teal wordmark, Apr 2026). Wrapped
                in a cream plaque so the coloured wordmark keeps its
                intended hues on the dark ink footer — previous invert()
                filter would have destroyed the colours. */}
            <div
              className="inline-block"
              style={{
                background: 'var(--color-cream)',
                padding: '14px 18px',
                border: '1px solid rgba(246, 238, 222, 0.24)',
              }}
            >
              <Image
                src={logo}
                alt="La Costa Gourmet"
                sizes="220px"
                placeholder="blur"
                className="w-[200px] h-auto block"
              />
            </div>
            <p className="type-label-sm text-gold-bright mt-4">
              Corporate HQ · Est. 2003
            </p>
            <address
              className="not-italic font-display text-[13px] leading-[1.6] text-paper/70 mt-5 italic"
              style={{ fontStyle: 'italic' }}
            >
              6209 Paseo Privado<br />
              Carlsbad, CA 92009<br />
              <a href="tel:+18583541120" className="hover:text-gold-bright transition-colors duration-200">
                (858) 354&ndash;1120
              </a>
              <br />
              <a href="mailto:customercare@lacostagourmet.com" className="hover:text-gold-bright transition-colors duration-200">
                customercare@lacostagourmet.com
              </a>
            </address>
          </div>

          {/* Shop column */}
          <div>
            <h4 className="type-label-sm text-gold-bright mb-5">Shop</h4>
            <ul className="space-y-2.5 font-display text-[14px]">
              {SHOP_LINKS.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="flink">{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Service column */}
          <div>
            <h4 className="type-label-sm text-gold-bright mb-5">Service</h4>
            <ul className="space-y-2.5 font-display text-[14px]">
              {SERVICE_LINKS.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="flink">{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Newsletter column */}
          <div>
            <h4 className="type-label-sm text-gold-bright mb-5">Dispatch</h4>
            <p className="font-display italic text-[13px] leading-[1.55] text-paper/75 mb-5 max-w-[280px]">
              New arrivals, seasonal picks, and the occasional café note. No spam. Unsubscribe any time.
            </p>
            {/* Non-interactive shell for 3B — wired to Resend in Phase 4.
                w-full on the flex container + explicit max-md:w-full on the
                input kills the previous mobile overflow (input was taking
                its intrinsic 20-char width in flex-col mode instead of
                stretching to the column). */}
            <div className="flex items-stretch max-md:flex-col w-full max-w-full">
              <label htmlFor="newsletter-email" className="sr-only">Email address</label>
              <input
                id="newsletter-email"
                type="email"
                placeholder="your@email.com"
                className="flex-1 min-w-0 bg-transparent font-display text-[14px] text-paper placeholder:text-paper/40 px-3 py-3 border border-[rgba(246,238,222,0.2)] focus:border-gold-bright focus:outline-none transition-colors duration-200 max-md:w-full"
              />
              <button
                type="button"
                className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink bg-gold-bright px-5 hover:bg-paper transition-colors duration-200 whitespace-nowrap max-md:py-3 max-md:w-full"
              >
                Subscribe
              </button>
            </div>
          </div>
        </div>

        {/* Badges row */}
        <div
          className="flex flex-wrap items-center gap-x-8 gap-y-3 py-5 max-md:gap-x-4 max-md:gap-y-2 max-md:py-3"
          style={{ borderBottom: '1px solid rgba(246, 238, 222, 0.14)' }}
        >
          {TRUST_BADGES.map((badge, idx) => (
            <Fragment key={badge}>
              <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-paper/60">
                {badge}
              </span>
              {idx < TRUST_BADGES.length - 1 && (
                <span className="text-gold/50 text-[9px]" aria-hidden="true">◆</span>
              )}
            </Fragment>
          ))}
        </div>

        {/* Trust-mark row */}
        <div className="pt-5 max-md:pt-3 text-center">
          <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-gold-bright">
            All Manufacturing Products Made in the USA
          </span>
        </div>

        {/* Bottom row */}
        <div className="flex items-center justify-between pt-3 max-md:pt-2 max-md:flex-col max-md:items-start max-md:gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-paper/65">
            © MMXXVI La Costa Gourmet. Made with care in California.
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-gold-bright">
            Vol. XXII · No. 0042
          </span>
        </div>
      </div>
    </footer>
  );
}
