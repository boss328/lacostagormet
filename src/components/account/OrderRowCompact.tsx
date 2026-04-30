import Link from 'next/link';

type OrderRowCompactProps = {
  order: {
    order_number: string;
    created_at: string;
    status: string;
    total: number | string;
    fulfillment_status?: string | null;
    tracking_number?: string | null;
    order_items?: Array<{ product_name: string; quantity: number }>;
  };
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function fmtStatus(s: string): string {
  return s.replace(/_/g, ' ');
}

function fmtMoney(v: number | string): string {
  const n = typeof v === 'string' ? Number(v) : v;
  return `$${n.toFixed(2)}`;
}

export function OrderRowCompact({ order }: OrderRowCompactProps) {
  const items = order.order_items ?? [];
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  return (
    <Link
      href={`/account/orders/${order.order_number}`}
      className="grid items-center gap-5 py-5 max-sm:grid-cols-1 max-sm:gap-2 hover:bg-paper-2 transition-colors duration-200"
      style={{
        gridTemplateColumns: '1fr auto auto auto',
        borderBottom: '1px solid var(--rule)',
        paddingLeft: 8,
        paddingRight: 8,
      }}
    >
      <div className="min-w-0">
        <p
          className="font-display italic text-brand-deep"
          style={{ fontSize: '20px', lineHeight: 1, letterSpacing: '-0.02em', fontWeight: 500 }}
        >
          {order.order_number}
        </p>
        <p className="type-data-mono text-ink-muted mt-2">
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
          {items[0] ? ` · ${items[0].product_name}` : ''}
          {items.length > 1 ? ` +${items.length - 1} more` : ''}
        </p>
        {order.tracking_number && (
          <p className="type-data-mono text-gold mt-1">
            ✓ Shipped · tracking added
          </p>
        )}
      </div>
      <span className="type-data-mono text-ink-muted max-sm:text-left">
        {fmtDate(order.created_at)}
      </span>
      <span
        className="type-label-sm text-cream max-sm:text-left"
        style={{
          padding: '5px 9px',
          background:
            order.status === 'paid'
              ? 'var(--color-forest)'
              : order.status === 'payment_held'
                ? 'var(--color-gold)'
                : order.status === 'cancelled'
                  ? 'var(--color-accent)'
                  : 'var(--color-ink-muted)',
        }}
      >
        {fmtStatus(order.status)}
      </span>
      <span
        className="font-display italic text-brand-deep text-right"
        style={{ fontSize: '18px', fontWeight: 500, letterSpacing: '-0.01em' }}
      >
        {fmtMoney(order.total)}
      </span>
    </Link>
  );
}
