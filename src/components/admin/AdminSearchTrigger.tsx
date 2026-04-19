'use client';

import { useEffect, useRef } from 'react';
import { Search } from 'lucide-react';

/**
 * Top-rail search trigger — opens the command palette. Also responds to
 * the `admin:focus-search` custom event dispatched by AdminShortcuts when
 * the user hits `/`.
 */
export function AdminSearchTrigger() {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onFocus() {
      buttonRef.current?.click();
    }
    window.addEventListener('admin:focus-search', onFocus);
    return () => window.removeEventListener('admin:focus-search', onFocus);
  }, []);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent('admin:open-palette'))}
      className="w-full max-w-[520px] mx-auto flex items-center gap-3 text-left transition-colors duration-200 hover:bg-white/5"
      style={{
        border: '1px solid rgba(212, 169, 97, 0.25)',
        padding: '7px 14px',
        background: 'rgba(246, 238, 222, 0.04)',
        color: 'rgba(246, 238, 222, 0.7)',
      }}
    >
      <Search size={13} strokeWidth={1.75} aria-hidden="true" />
      <span
        className="font-display flex-1"
        style={{ fontSize: '13px' }}
      >
        Search orders, customers, products…
      </span>
      <kbd
        className="font-mono uppercase"
        style={{
          fontSize: '9px',
          letterSpacing: '0.18em',
          padding: '2px 6px',
          border: '1px solid rgba(212, 169, 97, 0.35)',
          color: 'rgba(212, 169, 97, 0.85)',
        }}
      >
        ⌘K
      </kbd>
    </button>
  );
}
