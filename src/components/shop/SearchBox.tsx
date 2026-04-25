'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

type SearchBoxProps = {
  initialQuery?: string;
};

export function SearchBox({ initialQuery = '' }: SearchBoxProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState(initialQuery);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = value.trim();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  }

  return (
    <form
      onSubmit={onSubmit}
      role="search"
      className="flex items-center gap-3 bg-cream"
      style={{ border: '1px solid var(--rule-strong)', padding: '14px 18px' }}
    >
      <Search size={18} strokeWidth={1.5} className="text-ink-muted shrink-0" aria-hidden="true" />
      <label htmlFor="search-input" className="sr-only">
        Search products
      </label>
      <input
        ref={inputRef}
        id="search-input"
        type="search"
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search products..."
        autoComplete="off"
        className="flex-1 min-w-0 bg-transparent font-display text-[18px] text-ink placeholder:text-ink-muted/70 focus:outline-none"
      />
      <button
        type="submit"
        className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink bg-gold-bright px-4 py-2 hover:bg-paper transition-colors duration-200 whitespace-nowrap"
      >
        Search
      </button>
    </form>
  );
}
