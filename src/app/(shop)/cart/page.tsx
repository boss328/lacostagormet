import { CartContents } from '@/components/shop/CartContents';

export const metadata = {
  title: 'Your Cart',
  description: 'Review your La Costa Gourmet cart before checkout.',
};

export default function CartPage() {
  return <CartContents />;
}
