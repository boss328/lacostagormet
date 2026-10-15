import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { ADMIN_COOKIE, expectedSessionToken } from '@/lib/admin/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { selectPackingLines, type DocumentOrder, type InvoiceLine } from '@/lib/admin/order-documents';
import { OrderDocument } from '@/components/admin/orders/OrderDocument';
import { OrderPrintControls } from '@/components/admin/orders/OrderPrintControls';
import styles from '@/components/admin/orders/OrderDocument.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Print order', robots: { index: false, follow: false } };

export default async function PrintOrderPage({ params, searchParams }: {
  params: { orderNumber: string };
  searchParams: { type?: string | string[]; items?: string | string[] };
}) {
  const expected = await expectedSessionToken();
  if (!expected || cookies().get(ADMIN_COOKIE)?.value !== expected) {
    redirect(`/admin/login/?redirect=${encodeURIComponent(`/admin/orders/${params.orderNumber}/print/`)}`);
  }
  const type = searchParams.type ?? 'invoice';
  if (type !== 'invoice' && type !== 'packing-slip') notFound();

  const admin = createAdminClient();
  const { data, error } = await admin.from('orders').select('id, order_number, status, customer_email, created_at, shipping_address, billing_address, subtotal, discount, shipping_cost, tax, total').eq('order_number', params.orderNumber).maybeSingle();
  if (error) throw new Error('The order could not be loaded for printing. Please try again.');
  if (!data) notFound();
  const order = data as DocumentOrder & { id: string };
  const { data: rows, error: itemsError } = await admin.from('order_items').select('id, product_sku, product_name, quantity, unit_price, line_subtotal').eq('order_id', order.id).order('created_at').order('id');
  if (itemsError) throw new Error('The order items could not be loaded for printing. Please try again.');
  const items = (rows ?? []) as InvoiceLine[];
  const packing = selectPackingLines(items, type === 'packing-slip' ? searchParams.items : undefined);
  const selected = packing.error ? items : packing.lines;
  const partial = packing.lines.length !== items.length || packing.lines.some((line) => line.quantity !== items.find((item) => item.id === line.id)?.quantity);

  return (
    <div className={styles.page}>
      <OrderPrintControls
        key={`${type}-${JSON.stringify(searchParams.items)}`}
        orderNumber={order.order_number}
        type={type}
        lines={items.map(({ id, product_name, product_sku, quantity }) => ({ id, product_name, product_sku, quantity }))}
        selected={selected.map(({ id, quantity }) => ({ id, quantity }))}
        error={packing.error}
      />
      {!packing.error && <OrderDocument order={order} lines={type === 'invoice' ? items : packing.lines} type={type} partial={partial} />}
    </div>
  );
}
