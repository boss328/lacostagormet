import Image from 'next/image';
import { addressLines, documentMoney, documentPaymentStatus, invoiceTotals, type DocumentAddress, type DocumentLine, type DocumentOrder, type InvoiceLine } from '@/lib/admin/order-documents';
import styles from './OrderDocument.module.css';

export function OrderDocument({ order, lines, type, partial = false }: {
  order: DocumentOrder;
  lines: DocumentLine[] | InvoiceLine[];
  type: 'invoice' | 'packing-slip';
  partial?: boolean;
}) {
  const invoice = type === 'invoice';
  const date = new Date(order.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' });
  return (
    <article className={styles.document} aria-label={invoice ? 'Invoice' : 'Packing slip'}>
      <header className={styles.documentHeader}>
        <div>
          <Image src="/storefront/logo-green-purple.png" alt="La Costa Gourmet" width={180} height={85} priority unoptimized className={styles.logo} />
          <p>lacostagourmet.com<br />customercare@lacostagourmet.com<br />(858) 354-1120</p>
        </div>
        <div className={styles.documentTitle}>
          <h1>{invoice ? 'Invoice' : 'Packing slip'}</h1>
          <p><strong>{order.order_number}</strong><br />Order date: {date}</p>
          {invoice && <p>Payment status: <strong>{documentPaymentStatus(order.status)}</strong></p>}
          {!invoice && partial && <p>Partial order · Items in this box</p>}
        </div>
      </header>

      <section className={styles.addresses}>
        {invoice && <Address label="Bill to" address={order.billing_address} />}
        <Address label="Ship to" address={order.shipping_address} />
      </section>
      {invoice && <p className={styles.customerEmail}>{order.customer_email}</p>}

      <table className={styles.items}>
        <caption className={styles.tableCaption}>{invoice ? 'Order items' : 'Items in this package'} · {order.order_number}</caption>
        <colgroup>
          <col style={{ width: invoice ? '16%' : '23%' }} />
          <col />
          <col style={{ width: '10%' }} />
          {invoice && <><col style={{ width: '15%' }} /><col style={{ width: '16%' }} /></>}
        </colgroup>
        <thead>
          <tr><th scope="col">SKU</th><th scope="col">Product</th><th scope="col" className={styles.number}>Qty</th>{invoice && <><th scope="col" className={styles.number}>Unit price</th><th scope="col" className={styles.number}>Amount</th></>}</tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              <td className={styles.sku}>{line.product_sku}</td><td>{line.product_name}</td><td className={styles.number}>{line.quantity}</td>
              {invoice && <><td className={styles.number}>{documentMoney((line as InvoiceLine).unit_price)}</td><td className={styles.number}>{documentMoney((line as InvoiceLine).line_subtotal)}</td></>}
            </tr>
          ))}
          {lines.length === 0 && <tr><td colSpan={invoice ? 5 : 3}>No line items recorded.</td></tr>}
        </tbody>
      </table>

      {invoice && (
        <dl className={styles.totals}>
          {invoiceTotals(order).map((total) => <div key={total.label}><dt>{total.label}</dt><dd>{total.value}</dd></div>)}
        </dl>
      )}
      <footer className={styles.documentFooter}>
        <p>Thank you for choosing La Costa Gourmet.</p>
        <p>Questions about your order? Contact customercare@lacostagourmet.com and reference {order.order_number}.</p>
      </footer>
    </article>
  );
}

function Address({ label, address }: { label: string; address: DocumentAddress }) {
  const lines = addressLines(address);
  return <div><h2>{label}</h2><address>{lines.length ? lines.map((line, index) => <div key={index}>{line}</div>) : 'Not recorded'}</address></div>;
}
