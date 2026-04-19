import { CheckoutForm } from '@/components/checkout/CheckoutForm';

export const metadata = {
  title: 'Checkout',
  description: 'Complete your La Costa Gourmet order.',
  robots: { index: false, follow: false },
};

// Form reads ?error= query via useSearchParams on the client. Force dynamic
// render instead of static prerender to avoid the CSR-bailout at build time.
export const dynamic = 'force-dynamic';

export default function CheckoutPage() {
  return <CheckoutForm />;
}
