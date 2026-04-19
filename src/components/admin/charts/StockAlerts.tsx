import Link from 'next/link';
import { WidgetFrame } from '@/components/admin/charts/WidgetFrame';
import type { StockAlert } from '@/lib/admin/analytics';

export function StockAlerts({ alerts }: { alerts: StockAlert[] }) {
  return (
    <WidgetFrame
      numeral="VIII"
      eyebrow="Inventory"
      title={
        <>
          Stock <em className="type-accent">alerts</em>.
        </>
      }
      cornerValue={String(alerts.length)}
      cornerHint="products below threshold"
      minHeight={280}
    >
      {alerts.length === 0 ? (
        <p className="type-data-mono text-ink-muted py-6">
          No stock alerts — every SKU reads as in-stock.
        </p>
      ) : (
        <div className="flex flex-col">
          {alerts.slice(0, 10).map((p) => (
            <Link
              key={p.id}
              href={`/admin/products/${p.id}/`}
              className="flex items-baseline justify-between gap-3 py-2 px-1 hover:bg-paper-2 transition-colors duration-150"
              style={{ borderBottom: '1px solid var(--rule)' }}
            >
              <div className="flex-1 min-w-0 flex items-baseline gap-3">
                <span
                  className="type-data-mono shrink-0"
                  style={{
                    color:
                      p.stock_status === 'out_of_stock'
                        ? 'var(--color-accent)'
                        : 'var(--color-gold)',
                  }}
                >
                  {p.stock_status === 'out_of_stock' ? 'OUT' : 'LOW'}
                </span>
                <span
                  className="font-display text-ink truncate"
                  style={{ fontSize: '13.5px' }}
                >
                  {p.name}
                </span>
              </div>
              <span className="type-data-mono text-ink-muted shrink-0">{p.sku}</span>
            </Link>
          ))}
        </div>
      )}
      <p className="type-data-mono text-ink-muted mt-3">
        Numeric stock tracking arrives with the vendor-sync integration.
      </p>
    </WidgetFrame>
  );
}
