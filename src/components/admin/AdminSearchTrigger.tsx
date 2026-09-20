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
        border: '1px solid var(--rule)',
        padding: '9px 14px', borderRadius: 10,
        background: 'var(--color-paper-2)',
        color: 'var(--color-ink-muted)',
      }}
    >
      <Search size={13} strokeWidth={1.75} aria-hidden="true" />
      <span
        className="font-display flex-1 max-md:hidden"
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
          border: '1px solid var(--rule-strong)',
          color: 'var(--color-ink-muted)',
        }}
      >
        ⌘K
      </kbd>
    </button>
  );
}
