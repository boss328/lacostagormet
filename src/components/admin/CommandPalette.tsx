'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Cmd+K command palette. Searches orders (by order_number + email),
 * customers (by email + name), and products (by SKU + name) server-side
 * via /api/admin/search. Also includes static navigation actions.
 *
 * Keyboard:
 *   ⌘K / Ctrl+K — toggle
 *   Esc         — close
 *   ↑ / ↓       — move selection
 *   Enter       — run selected command
 *
 * Also listens for the `admin:open-palette` custom event from the
 * AdminSearchTrigger in the top rail.
 */

type ResultGroup = 'action' | 'order' | 'customer' | 'product';

type Result = {
  id: string;
  group: ResultGroup;
  label: string;
  sublabel?: string;
  href: string;
  hint?: string;
};

// Trailing slashes match trailingSlash:true — see AdminSidebar comment.
const ACTIONS: Result[] = [
  { id: 'nav-dash',      group: 'action', label: 'Go to Dashboard', href: '/admin/',           hint: 'g d' },
  { id: 'nav-orders',    group: 'action', label: 'Go to Orders',    href: '/admin/orders/',    hint: 'g o' },
  { id: 'nav-customers', group: 'action', label: 'Go to Customers', href: '/admin/customers/', hint: 'g c' },
  { id: 'nav-products',  group: 'action', label: 'Go to Products',  href: '/admin/products/',  hint: 'g p' },
  { id: 'nav-imports',   group: 'action', label: 'Go to Imports',   href: '/admin/imports/',   hint: 'g i' },
  { id: 'nav-store',     group: 'action', label: 'Open storefront', href: '/',                 hint: '↗' },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>(ACTIONS);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setResults(ACTIONS);
    setActive(0);
  }, []);

  // Keyboard open (Cmd+K / Ctrl+K) + custom event from top-rail button.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('admin:open-palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('admin:open-palette', onOpen);
    };
  }, []);

  // Focus input + reset on open.
  useEffect(() => {
    if (open) {
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // Fuzzy search — debounced, server-side for entities.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();

    // Filter static actions first.
    const filteredActions = q
      ? ACTIONS.filter((a) => a.label.toLowerCase().includes(q.toLowerCase()))
      : ACTIONS;

    if (!q) {
      setResults(ACTIONS);
      setLoading(false);
      return;
    }

    setLoading(true);
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error('search failed');
        const body = (await res.json()) as { results: Result[] };
        // Static actions first, then server entities.
        setResults([...filteredActions, ...(body.results ?? [])]);
      } catch (e) {
        if ((e as { name?: string }).name !== 'AbortError') {
          console.error('[palette] search', e);
        }
      } finally {
        setLoading(false);
      }
    }, 140);

    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, open]);

  useEffect(() => {
    if (active >= results.length) setActive(Math.max(0, results.length - 1));
  }, [results, active]);

  // Input-level key handling for nav + run.
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = results[active];
      if (chosen) {
        close();
        router.push(chosen.href);
      }
    }
  }

  if (!open) return null;

  // Group results for rendering.
  const grouped = new Map<ResultGroup, Result[]>();
  for (const r of results) {
    const g = grouped.get(r.group) ?? [];
    g.push(r);
    grouped.set(r.group, g);
  }

  // Linearise the list so `active` index maps cleanly.
  let cursor = 0;

  return (
    <div
      role="dialog"
      aria-label="Command palette"
      onClick={close}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
      style={{ background: 'rgba(26, 17, 10, 0.45)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-cream w-full max-w-[620px]"
        style={{ border: '1px solid var(--rule-strong)' }}
      >
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: '1px solid var(--rule)' }}
        >
          <span className="type-label-sm text-ink-muted">⌘K</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search orders, customers, products…"
            className="flex-1 bg-transparent font-display text-ink outline-none"
            style={{ fontSize: '17px', letterSpacing: '-0.01em' }}
          />
          {loading && (
            <span className="type-data-mono text-ink-muted">Searching…</span>
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {results.length === 0 && (
            <p className="type-data-mono text-ink-muted p-5">No matches.</p>
          )}
          {Array.from(grouped.entries()).map(([group, items]) => (
            <div key={group}>
              <p
                className="type-label-sm text-ink-muted"
                style={{ padding: '10px 16px 6px', background: 'var(--color-paper-2)' }}
              >
                {groupLabel(group)}
              </p>
              {items.map((r) => {
                const idx = cursor++;
                const activeRow = idx === active;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => {
                      close();
                      router.push(r.href);
                    }}
                    className="w-full text-left flex items-center gap-3 transition-colors duration-100"
                    style={{
                      padding: '11px 16px',
                      background: activeRow ? 'var(--color-paper-2)' : 'transparent',
                      borderLeft: activeRow
                        ? '2px solid var(--color-brand-deep)'
                        : '2px solid transparent',
                    }}
                  >
                    <span className="flex-1 min-w-0">
                      <span
                        className="font-display text-ink block truncate"
                        style={{ fontSize: '15px' }}
                      >
                        {r.label}
                      </span>
                      {r.sublabel && (
                        <span className="type-data-mono text-ink-muted block truncate">
                          {r.sublabel}
                        </span>
                      )}
                    </span>
                    {r.hint && (
                      <span className="type-data-mono text-ink-muted shrink-0">{r.hint}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <p
          className="type-data-mono text-ink-muted"
          style={{ padding: '8px 16px', borderTop: '1px solid var(--rule)' }}
        >
          ↑↓ navigate · ↵ select · Esc close
        </p>
      </div>
    </div>
  );
}

function groupLabel(g: ResultGroup): string {
  switch (g) {
    case 'action':   return 'Actions';
    case 'order':    return 'Orders';
    case 'customer': return 'Customers';
    case 'product':  return 'Products';
  }
}
