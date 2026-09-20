import Link from 'next/link';
import { PageHeader } from '@/components/shop/PageHeader';
import { InquiryForm } from '@/components/forms/InquiryForm';
export const metadata = {
  title: 'For business',
  alternates: { canonical: '/for-business/' },
};
export default function ForBusinessPage() {
  return (
    <>
      <PageHeader
        breadcrumb={[{ href: '/', label: 'Home' }, { label: 'For business' }]}
        eyebrow="La Costa Gourmet for business"
        title={
          <>
            Your menu.
            <br />
            Our kind of business.
          </>
        }
        lede="Keep your café, coffee cart or office stocked with the brands your customers come back for."
      />
      <section className="home-section wrap">
        <div className="business-tiers">
          {[
            [
              'Everyday essentials',
              'No minimum order',
              'Shop the complete catalog with clear pack sizes and prices.',
            ],
            [
              'Volume pricing',
              'Orders of $400+',
              'Tell us what you need. Our team will help with a custom quote.',
            ],
            [
              'Your next restock',
              'Orders of $700+',
              'Ask about our next volume pricing tier for larger orders.',
            ],
          ].map(([title, amount, text]) => (
            <article key={title}>
              <p className="eyebrow">{title}</p>
              <h2>{amount}</h2>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section id="inquiry" className="wrap business-inquiry">
        <div>
          <p className="eyebrow">Personal attention</p>
          <h2 className="type-display-2">
            Let’s keep your
            <br />
            counter stocked.
          </h2>
          <p>
            Tell us what you’re serving and how often you restock. We’ll help
            with product selection, pack sizes, and volume pricing.
          </p>
          <a className="text-link" href="tel:+18583541120">
            Call (858) 354-1120 ↗
          </a>
          <br />
          <Link className="text-link" href="/shop">
            Browse the catalog ›
          </Link>
        </div>
        <InquiryForm />
      </section>
    </>
  );
}
