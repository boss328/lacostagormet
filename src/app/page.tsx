import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCatalog } from '@/lib/catalog-query';
import { COLLECTIONS, collectionImage } from '@/lib/collections';
import { SHIPPING_TIERS } from '@/lib/checkout/shipping';
import { ProductCard } from '@/components/shop/ProductCard';
import { FeaturedCarousel } from '@/components/home/FeaturedCarousel';
export const metadata = { alternates: { canonical: '/' } };
export const dynamic = 'force-dynamic';
export default async function HomePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  if (typeof searchParams.code === 'string')
    redirect(`/auth/callback?code=${encodeURIComponent(searchParams.code)}`);
  const catalog = await getCatalog();
  const featured = [...catalog.products]
    .sort(
      (a, b) =>
        Number(b.is_featured) - Number(a.is_featured) ||
        b.created_at.localeCompare(a.created_at) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 8);
  const brandSlugs = [
    'big-train',
    'david-rio',
    'mocafe',
    'monin',
    '1883-maison-routin',
    'dr-smoothie',
  ];
  return (
    <main>
      <section className="home-hero">
        <div className="wrap">
          <h1>
            Café favorites.
            <br />
            Yours to make.
          </h1>
          <p>
            Chai, matcha, coffee and more. The brands you love, delivered to
            your home or business.
          </p>
          <div className="hero-actions">
            <Link href="/shop" className="btn btn-solid">
              Shop all products
            </Link>
            <a className="text-link" href="#categories">
              Find your drink ›
            </a>
          </div>
        </div>
        <div className="hero-stage">
          <Image
            src="/storefront/hero-hot-coffees.webp"
            alt="Hot latte, pumpkin spice latte and flat white with latte art"
            width={1400}
            height={933}
            sizes="100vw"
            priority
          />
        </div>
      </section>
      <section id="categories" className="home-section wrap">
        <div className="section-heading">
          <h2>What are you making?</h2>
          <Link href="/shop" className="text-link">
            View all ›
          </Link>
        </div>
        <div className="category-grid">
          {COLLECTIONS.map((c) => (
            <Link
              className="category-card"
              href={`/shop/${c.slug}`}
              key={c.slug}
            >
              <Image
                src={collectionImage(c.image)}
                alt={c.alt}
                width={600}
                height={600}
                sizes="(min-width: 800px) 280px, 45vw"
              />
              <span>
                {c.name}
                <b aria-hidden="true">›</b>
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section className="featured-section">
        <div className="home-section wrap">
          <div className="section-heading">
            <h2>
              Featured favorites.
              <br />
              <span>Ready for your next restock.</span>
            </h2>
            <Link href="/shop" className="text-link">
              Shop all products ›
            </Link>
          </div>
          <FeaturedCarousel count={featured.length}>
            {featured.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </FeaturedCarousel>
        </div>
      </section>
      <section className="home-section wrap">
        <div className="section-heading">
          <h2>
            Your go-to brands.
            <br />
            <span>All in one place.</span>
          </h2>
          <Link href="/brand" className="text-link">
            Explore our brands ›
          </Link>
        </div>
        <div className="brand-list">
          {brandSlugs.map((slug) => {
            const b = catalog.brands.find((b) => b.slug === slug);
            return b ? (
              <Link href={`/brand/${slug}`} key={slug}>
                {b.name}
              </Link>
            ) : null;
          })}
        </div>
      </section>
      <section className="wrap business-panel">
        <div>
          <p className="eyebrow">La Costa Gourmet for business</p>
          <h2>
            Your menu.
            <br />
            Our kind of business.
          </h2>
          <p>
            Keep your café, coffee cart or office stocked with the brands your
            customers come back for.
          </p>
          <Link href="/for-business" className="btn btn-solid">
            Talk to our team
          </Link>
        </div>
        <div className="business-facts">
          <div>
            <h3>
              Four warehouses.
              <br />
              One reliable source.
            </h3>
            <p>A nationwide supply network for your everyday essentials.</p>
          </div>
          <div>
            <h3>Buying more? Let’s talk volume pricing.</h3>
            <p>Ask about pricing tiers for orders of $400 and $700+.</p>
          </div>
          <div>
            <h3>A real person to help.</h3>
            <p>
              Product selection, pack sizes, your next order.
              <br />
              <a className="text-link" href="tel:+18583541120">
                Call (858) 354-1120 ↗
              </a>
            </p>
          </div>
        </div>
      </section>
      <section className="home-section wrap service-grid">
        <div>
          <h3>
            A little more.
            <br />
            Shipping’s on us.
          </h3>
          <p>
            Free ground shipping on orders ${SHIPPING_TIERS.freeThreshold}+
            within the contiguous U.S.
          </p>
          <Link href="/shipping" className="text-link">
            Shipping details ›
          </Link>
        </div>
        <div>
          <h3>
            Family-owned.
            <br />
            Since 2003.
          </h3>
          <p>
            From Carlsbad, California to home kitchens and café counters
            nationwide.
          </p>
          <a
            href="mailto:customercare@lacostagourmet.com"
            className="text-link"
          >
            Email our family team ›
          </a>
        </div>
        <div>
          <h3>
            A question?
            <br />
            We’re here for it.
          </h3>
          <p>
            Get personal help choosing ingredients or checking on your order.
          </p>
          <Link className="text-link" href="/contact">
            Get in touch ›
          </Link>
        </div>
      </section>
      <section className="faq-section">
        <div className="faq-inner">
          <h2>A few good answers.</h2>
          {[
            [
              'Why buy from La Costa Gourmet?',
              'Great customer service, with attention to checking every order for accuracy and freshness.',
            ],
            [
              'Will my order have a shipping charge?',
              `Ground shipping is free on orders of $${SHIPPING_TIERS.freeThreshold} or more within the contiguous United States.`,
            ],
            [
              'When will my order ship?',
              'Most orders placed by 2 PM will ship within 2 to 3 business days.',
            ],
            [
              'What if my order is lost or damaged?',
              'Contact customer service within 2 weeks to report the problem.',
            ],
            [
              'Can I trust La Costa Gourmet?',
              'La Costa Gourmet has been trusted by coffee shops and customers for over 20 years.',
            ],
            [
              'Will my information be shared?',
              'We do not sell your personal information. Read our privacy policy for details.',
            ],
          ].map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
