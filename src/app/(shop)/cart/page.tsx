import { Suspense } from 'react';
import { CartContents } from '@/components/shop/CartContents';

export const metadata = {
  title: 'Your Cart',
  description: 'Review your La Costa Gourmet cart before checkout.',
};

// CartContents reads ?recover=<id> via useSearchParams to rehydrate
// abandoned-cart contents. Next 14 requires that be wrapped in a
// Suspense boundary; otherwise static prerender bails out.
export default function CartPage() {
  return (
    <Suspense fallback={<p className="type-label text-ink-muted p-8">Loading cart…</p>}>
      <CartContents />
    </Suspense>
  );
}
