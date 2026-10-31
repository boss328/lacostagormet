import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { MANUAL_PAYMENT_COOKIE, manualPaymentReviewId, verifyManualPaymentGrant } from '@/lib/checkout/manual-payment-grant';
import { createAdminClient } from '@/lib/supabase/admin';
import { isReadOnlyPreview } from '@/lib/preview-mode';
import { ManualPaymentButton } from '@/components/checkout/ManualPaymentButton';
import { PendingPaymentPoller } from '@/components/checkout/PendingPaymentPoller';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pay your order', robots: { index: false, follow: false }, referrer: 'no-referrer' };

const money = (value: string | number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value));

function Message({ children }: { children: React.ReactNode }) {
  return <section className="max-w-2xl mx-auto px-6 py-16">
    <h1 className="font-display text-3xl mb-4">Order payment</h1>
    <p>{children}</p>
    <a className="inline-block underline mt-5" href="/contact/">Contact La Costa Gourmet</a>
  </section>;
}

export default async function PayOrderPage({ searchParams }: { searchParams: { error?: string; returned?: string; order?: string } }) {
  const token = cookies().get(MANUAL_PAYMENT_COOKIE)?.value || '';
  const grant = verifyManualPaymentGrant(token);
  if (!grant) return <Message>Open the private payment link from La Costa Gourmet. If it has expired, ask us for a fresh link.</Message>;
  if (isReadOnlyPreview()) return <Message>Customer payments are available on the live store.</Message>;
  const { data: order, error } = await createAdminClient().from('orders')
    .select('order_number, source, status, total, subtotal, shipping_cost, tax, order_items(product_name, quantity, unit_price, line_subtotal)')
    .eq('id', grant.orderId).eq('source', 'manual').maybeSingle();
  if (error) return <Message>We couldn’t load your order. Please try again shortly.</Message>;
  if (!order || grant.amountCents !== Math.round(Number(order.total) * 100))
    return <Message>Please request an updated payment link for this order.</Message>;
  if (searchParams.order && searchParams.order !== order.order_number)
    return <Message>Reopen the payment link for the order you want to review.</Message>;
  if (order.status === 'paid') return <Message>Payment received. Order {order.order_number} is paid in full at {money(order.total)}.</Message>;
  if (order.status === 'payment_held') return <Message>The payment for {order.order_number} is under review. We’ll confirm the order once that review is complete.</Message>;
  if (order.status !== 'pending') return <Message>This order is no longer awaiting payment.</Message>;
  if (searchParams.error) return <Message>Please contact La Costa Gourmet about the payment for order {order.order_number} before trying again.</Message>;
  if (searchParams.returned === '1') return <>
    <Message>We’re checking the payment for order {order.order_number}. This page will update when payment is confirmed.</Message>
    <PendingPaymentPoller orderNumber={order.order_number} />
  </>;
  return <section className="max-w-2xl mx-auto px-6 py-12">
    <p className="type-label text-ink-muted">Order {order.order_number}</p>
    <h1 className="font-display text-3xl my-4">Review your order</h1>
    <ul className="divide-y divide-rule border-y border-rule">
      {order.order_items.map((item, index) => <li className="flex justify-between gap-4 py-4" key={index}>
        <div><p>{item.product_name}</p><p className="text-sm text-ink-muted">{item.quantity} × {money(item.unit_price)}</p></div>
        <strong>{money(item.line_subtotal)}</strong>
      </li>)}
    </ul>
    <dl className="space-y-2 mt-5">
      {[['Subtotal', order.subtotal], ['Shipping', order.shipping_cost], ['Tax', order.tax], ['Total', order.total]].map(([label, amount]) =>
        <div className="flex justify-between" key={label}><dt>{label}</dt><dd>{money(amount)}</dd></div>)}
    </dl>
    <ManualPaymentButton reviewId={manualPaymentReviewId(token)} total={money(order.total)} />
  </section>;
}
