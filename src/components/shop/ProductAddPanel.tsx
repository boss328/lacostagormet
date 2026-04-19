'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useCartStore, type CartItem } from '@/stores/cart';

type ProductAddPanelProps = {
  item: Omit<CartItem, 'quantity'>;
};

export function ProductAddPanel({ item }: ProductAddPanelProps) {
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const addItem = useCartStore((s) => s.addItem);

  const dec = () => setQty((q) => Math.max(1, q - 1));
  const inc = () => setQty((q) => Math.min(99, q + 1));

  const handleAdd = () => {
    addItem(item, qty);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1400);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-5">
        <span className="type-label-sm text-ink-muted">Quantity</span>
        <div
          className="inline-flex items-stretch"
          style={{ border: '1px solid var(--rule-strong)' }}
        >
          <button
            type="button"
            onClick={dec}
            disabled={qty <= 1}
            aria-label="Decrease quantity"
            className="flex items-center justify-center text-ink hover:bg-paper-2 transition-colors duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ width: 40, height: 40 }}
          >
            <Minus size={14} strokeWidth={1.5} />
          </button>
          <span
            className="flex items-center justify-center font-mono text-ink"
            style={{
              width: 56,
              fontSize: '14px',
              letterSpacing: '0.1em',
              borderLeft: '1px solid var(--rule)',
              borderRight: '1px solid var(--rule)',
            }}
            aria-live="polite"
          >
            {qty}
          </span>
          <button
            type="button"
            onClick={inc}
            aria-label="Increase quantity"
            className="flex items-center justify-center text-ink hover:bg-paper-2 transition-colors duration-200"
            style={{ width: 40, height: 40 }}
          >
            <Plus size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={handleAdd}
        className="btn btn-solid w-full justify-center"
        style={{ padding: '18px 26px' }}
      >
        <span>{justAdded ? 'Added to cart' : 'Add to cart'}</span>
        <span className="btn-arrow" aria-hidden="true">→</span>
      </button>

      <p className="type-data-mono text-ink-muted">
        Ships in 1–2 business days from Carlsbad
      </p>
    </div>
  );
}
