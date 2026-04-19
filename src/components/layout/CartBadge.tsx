'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { useCartStore, selectItemCount } from '@/stores/cart';

export function CartBadge() {
  const [hydrated, setHydrated] = useState(false);
  const count = useCartStore(selectItemCount);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const display = hydrated ? count : 0;

  return (
    <Link
      href="/cart"
      className="flex items-center gap-2.5"
      aria-label={`Cart, ${display} ${display === 1 ? 'item' : 'items'}`}
    >
      <ShoppingBag size={18} strokeWidth={1.5} className="text-ink" />
      <span className="bg-ink text-paper font-mono text-[10px] leading-none tracking-[0.18em] px-2.5 py-1.5">
        {display}
      </span>
    </Link>
  );
}
