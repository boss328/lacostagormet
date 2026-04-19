import { CheckoutForm } from '@/components/checkout/CheckoutForm';

export const metadata = {
  title: 'Checkout',
  description: 'Complete your La Costa Gourmet order.',
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return <CheckoutForm />;
}
