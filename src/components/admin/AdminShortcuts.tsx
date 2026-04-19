'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * Linear-style keyboard shortcuts for the admin shell.
 *
 * Bindings:
 *   g d  → /admin
 *   g o  → /admin/orders
 *   g c  → /admin/customers
 *   g p  → /admin/products
 *   g i  → /admin/imports
 *   /    → focus the top-rail search trigger
 *   ?    → toggle the help overlay
 *   ⌘K   → open the command palette (handled by CommandPalette directly)
 *
 * Ignored when the user is typing in an input/textarea/contentEditable
 * or when a modifier other than Shift is held (reserving ⌘ / Ctrl /
 * Alt for browser + palette shortcuts).
 */

type GotoTarget =
  | { key: 'd'; path: '/admin' }
  | { key: 'o'; path: '/admin/orders' }
  | { key: 'c'; path: '/admin/customers' }
  | { key: 'p'; path: '/admin/products' }
  | { key: 'v'; path: '/admin/vendors' }
  | { key: 'u'; path: '/admin/purchase-orders' }
  | { key: 'i'; path: '/admin/imports' };

const GOTO_MAP: Record<string, string> = {
  d: '/admin',
  o: '/admin/orders',
  c: '/admin/customers',
  p: '/admin/products',
  v: '/admin/vendors',
  u: '/admin/purchase-orders',
  i: '/admin/imports',
};

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function AdminShortcuts() {
  const router = useRouter();
  const gPending = useRef(false);
  const gTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditable(e.target)) return;

      // ? → help
      if (e.key === '?') {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }

      // Esc closes help if open.
      if (e.key === 'Escape' && helpOpen) {
        setHelpOpen(false);
        return;
      }

      // / → focus search (custom event picked up by AdminSearchTrigger).
      if (e.key === '/') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('admin:focus-search'));
        return;
      }

      // g → arm the goto sequence.
      if (e.key === 'g' && !gPending.current) {
        gPending.current = true;
        if (gTimeout.current) clearTimeout(gTimeout.current);
        gTimeout.current = setTimeout(() => {
          gPending.current = false;
        }, 900);
        return;
      }

      // Second key of the goto sequence.
      if (gPending.current) {
        const path = GOTO_MAP[e.key];
        gPending.current = false;
        if (gTimeout.current) clearTimeout(gTimeout.current);
        if (path) {
          e.preventDefault();
          router.push(path);
        }
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, helpOpen]);

  if (!helpOpen) return null;

  return (
    <div
      role="dialog"
      aria-label="Keyboard shortcuts"
      onClick={() => setHelpOpen(false)}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(26, 17, 10, 0.55)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-cream"
        style={{
          border: '1px solid var(--rule-strong)',
          padding: '36px 40px',
          maxWidth: 520,
          width: 'calc(100% - 48px)',
        }}
      >
        <p className="type-label text-accent mb-4">§ Keyboard shortcuts</p>
        <h2 className="type-display-2 mb-6" style={{ fontSize: '32px' }}>
          Quick <em className="type-accent">navigation</em>.
        </h2>

        <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-3">
          <Row keys="⌘K" label="Open command palette" />
          <Row keys="/" label="Focus global search" />
          <Row keys="g d" label="Go to Dashboard" />
          <Row keys="g o" label="Go to Orders" />
          <Row keys="g c" label="Go to Customers" />
          <Row keys="g p" label="Go to Products" />
          <Row keys="g v" label="Go to Vendors" />
          <Row keys="g u" label="Go to Purchase Orders" />
          <Row keys="g i" label="Go to Imports" />
          <Row keys="?" label="Toggle this help" />
          <Row keys="Esc" label="Close open modal" />
        </dl>

        <p
          className="type-data-mono text-ink-muted mt-6"
          style={{ paddingTop: 14, borderTop: '1px dashed var(--rule)' }}
        >
          Click anywhere outside or press Esc to dismiss.
        </p>
      </div>
    </div>
  );
}

function Row({ keys, label }: { keys: string; label: string }) {
  return (
    <>
      <dt>
        <kbd
          className="font-mono uppercase bg-paper-2 text-ink"
          style={{
            fontSize: '10px',
            letterSpacing: '0.12em',
            padding: '4px 8px',
            border: '1px solid var(--rule-strong)',
          }}
        >
          {keys}
        </kbd>
      </dt>
      <dd className="font-display text-ink" style={{ fontSize: '15px' }}>
        {label}
      </dd>
    </>
  );
}

// Type satisfied by the exhaustive pattern above; keep the GotoTarget union
// for documentation even though the runtime lookup uses a plain string map.
type _t = GotoTarget;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _typeCheck: _t | null = null;
