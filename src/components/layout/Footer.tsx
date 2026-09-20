import Image from 'next/image';
import Link from 'next/link';
import { COLLECTIONS } from '@/lib/collections';
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-grid">
          <div className="footer-about">
            <Link href="/">
              <Image
                src="/storefront/logo-green-purple.png"
                alt="La Costa Gourmet"
                width={180}
                height={85}
              />
            </Link>
            <p>
              Café favorites for your home and business.
              <br />
              Family-owned in Carlsbad since 2003.
            </p>
            <a href="tel:+18583541120">(858) 354-1120</a>
            <a href="mailto:customercare@lacostagourmet.com">
              customercare@lacostagourmet.com
            </a>
          </div>
          <div>
            <h2>Shop</h2>
            {COLLECTIONS.map((c) => (
              <Link key={c.slug} href={`/shop/${c.slug}`}>
                {c.name}
              </Link>
            ))}
          </div>
          <div>
            <h2>Here to help</h2>
            <Link href="/contact">Contact us</Link>
            <Link href="/shipping">Shipping</Link>
            <Link href="/returns">Returns & order help</Link>
            <Link href="/for-business">For business</Link>
            <Link href="/brand">Our brands</Link>
          </div>
          <div>
            <h2>Your account</h2>
            <Link href="/account">Account overview</Link>
            <Link href="/account/orders">Orders & tracking</Link>
            <Link href="/account/addresses">Saved addresses</Link>
            <Link href="/cart">Shopping bag</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} La Costa Gourmet</p>
          <div>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
