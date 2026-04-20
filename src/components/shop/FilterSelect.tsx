'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTransition } from 'react';

export type SelectOption = { value: string; label: string };

type FilterSelectProps = {
  name: string;
  options: SelectOption[];
  currentValue?: string;
  placeholderLabel: string;
  ariaLabel: string;
};

export function FilterSelect({
  name,
  options,
  currentValue,
  placeholderLabel,
  ariaLabel,
}: FilterSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function handleChange(nextValue: string) {
    const qs = new URLSearchParams(params.toString());
    if (nextValue) qs.set(name, nextValue);
    else qs.delete(name);
    // Reset pagination whenever a filter changes
    qs.delete('page');
    const next = qs.toString();
    startTransition(() => {
      router.push(next ? `${pathname}?${next}` : pathname, { scroll: false });
    });
  }

  return (
    <select
      name={name}
      aria-label={ariaLabel}
      value={currentValue ?? ''}
      onChange={(e) => handleChange(e.target.value)}
      disabled={isPending}
      className="font-display italic text-ink bg-transparent border-b border-rule pb-1 pr-6 pl-1 cursor-pointer hover:border-ink focus:border-brand-deep focus:outline-none transition-colors duration-200 max-md:!text-[13px]"
      style={{
        fontSize: '16px',
        letterSpacing: '-0.01em',
        backgroundImage:
          'url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%2710%27 height=%276%27 viewBox=%270 0 10 6%27 fill=%27none%27><path d=%27M1 1l4 4 4-4%27 stroke=%27%234E2410%27 stroke-width=%271.2%27 stroke-linecap=%27round%27/></svg>")',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 2px center',
        WebkitAppearance: 'none',
        MozAppearance: 'none',
        appearance: 'none',
      }}
    >
      <option value="">{placeholderLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
