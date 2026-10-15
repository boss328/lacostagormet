'use client';

import { useState } from 'react';
import type { DocumentLine, PackingSelection } from '@/lib/admin/order-documents';
import styles from './OrderDocument.module.css';

export function OrderPrintControls({
  orderNumber,
  type,
  lines,
  selected,
  error,
}: {
  orderNumber: string;
  type: 'invoice' | 'packing-slip';
  lines: DocumentLine[];
  selected: PackingSelection[];
  error: string | null;
}) {
  const [quantities, setQuantities] = useState(() => Object.fromEntries(lines.map((line) => [line.id, String(selected.find((s) => s.id === line.id)?.quantity ?? line.quantity)])));
  const [included, setIncluded] = useState(() => new Set(selected.map((line) => line.id)));
  const [dirty, setDirty] = useState(false);
  const selection = lines.filter((line) => included.has(line.id)).map((line) => ({ id: line.id, quantity: Number(quantities[line.id]) }));
  const canApply = selection.length > 0 && selection.every((line) => Number.isSafeInteger(line.quantity) && line.quantity > 0 && line.quantity <= lines.find((original) => original.id === line.id)!.quantity);

  return (
    <section className={styles.toolbar} aria-label="Document controls">
      <div className={styles.actions}>
        <a href={`/admin/orders/${encodeURIComponent(orderNumber)}/`}>← Back to order</a>
        <button type="button" onClick={() => window.print()} disabled={Boolean(error) || dirty || lines.length === 0}>
          Print / Save PDF
        </button>
      </div>
      <p>Print on US Letter paper or choose Save as PDF. Turn off browser headers and footers for a clean document.</p>
      {type === 'packing-slip' && (
        <details open={Boolean(error)}>
          <summary>Choose items for this box</summary>
          <form method="get" action={`/admin/orders/${encodeURIComponent(orderNumber)}/print/`}>
            <input type="hidden" name="type" value="packing-slip" />
            <input type="hidden" name="items" value={JSON.stringify(selection)} />
            <p>Select the items and quantities in this package. Printing a slip does not mark them shipped.</p>
            <div className={styles.selectionList}>
              {lines.map((line) => (
                <div className={styles.selectionRow} key={line.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={included.has(line.id)}
                      onChange={(event) => {
                        setIncluded((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(line.id);
                          else next.delete(line.id);
                          return next;
                        });
                        setDirty(true);
                      }}
                    />
                    <span>{line.product_name}<small>{line.product_sku}</small></span>
                  </label>
                  <label className={styles.quantityLabel}>
                    <span>Quantity</span>
                    <input
                      type="number"
                      min={1}
                      max={line.quantity}
                      step={1}
                      required={included.has(line.id)}
                      disabled={!included.has(line.id)}
                      value={quantities[line.id]}
                      aria-label={`Quantity of ${line.product_name}`}
                      onChange={(event) => {
                        setQuantities((current) => ({ ...current, [line.id]: event.target.value }));
                        setDirty(true);
                      }}
                    />
                    <span>of {line.quantity}</span>
                  </label>
                </div>
              ))}
            </div>
            <button type="submit" disabled={!canApply}>Update packing slip</button>
            {dirty && <p role="status">Update the packing slip to apply your changes before printing.</p>}
          </form>
        </details>
      )}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </section>
  );
}
