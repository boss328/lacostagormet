'use client';

import { useEffect, useState, type ChangeEvent } from 'react';

export type ImageItem = {
  // Stable client-side key (for React + new-file lookup on the API side).
  key: string;
  // 'existing' = already stored on this product, 'new' = pending upload.
  kind: 'existing' | 'new';
  // For existing rows.
  id?: string;
  // Public URL (for existing) or object URL (for new).
  previewUrl: string;
  // Only set when kind === 'new'.
  file?: File;
  isPrimary: boolean;
};

const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type Props = {
  items: ImageItem[];
  onChange: (next: ImageItem[]) => void;
  errorMessage?: string;
};

/**
 * Shared multi-image editor used by both NewProductForm and EditProductForm.
 *
 * Holds an ordered array of images (existing + pending). Renders a
 * thumbnail grid where each tile carries: remove (×), star (set primary),
 * and up/down reorder arrows. The first image auto-becomes primary if
 * the array has any items and no current primary exists.
 *
 * Caller owns the items array and is responsible for submitting it. This
 * component handles file selection, validation, and the unified UI.
 */
export function MultiImageEditor({ items, onChange, errorMessage }: Props) {
  const [localError, setLocalError] = useState<string | null>(null);

  // Auto-promote primary if nothing is marked but we have at least one.
  useEffect(() => {
    if (items.length === 0) return;
    if (!items.some((i) => i.isPrimary)) {
      const next = items.map((i, idx) => ({ ...i, isPrimary: idx === 0 }));
      onChange(next);
    }
  }, [items, onChange]);

  function handleFiles(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    // Reset the input so picking the same file again still fires onChange.
    e.target.value = '';
    if (picked.length === 0) return;

    setLocalError(null);

    const remaining = MAX_IMAGES - items.length;
    if (remaining <= 0) {
      setLocalError(`Up to ${MAX_IMAGES} images per product.`);
      return;
    }

    const accepted: ImageItem[] = [];
    const errors: string[] = [];

    for (const file of picked.slice(0, remaining)) {
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        errors.push(`${file.name}: not JPEG/PNG/WebP`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        errors.push(`${file.name}: over 8 MB`);
        continue;
      }
      accepted.push({
        key: makeKey(),
        kind: 'new',
        file,
        previewUrl: URL.createObjectURL(file),
        isPrimary: false,
      });
    }

    if (picked.length > remaining) {
      errors.push(`Only ${remaining} more allowed (max ${MAX_IMAGES}).`);
    }

    if (errors.length > 0) setLocalError(errors.join(' · '));
    if (accepted.length === 0) return;

    const next = [...items, ...accepted];
    // If nothing was primary before, the first appended becomes primary
    // via the useEffect; nothing to do here.
    onChange(next);
  }

  function remove(key: string) {
    setLocalError(null);
    const removed = items.find((i) => i.key === key);
    if (removed?.kind === 'new' && removed.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(removed.previewUrl);
    }
    let next = items.filter((i) => i.key !== key);
    // If we just removed the primary, promote the first remaining.
    if (removed?.isPrimary && next.length > 0 && !next.some((i) => i.isPrimary)) {
      next = next.map((i, idx) => ({ ...i, isPrimary: idx === 0 }));
    }
    onChange(next);
  }

  function setPrimary(key: string) {
    const next = items.map((i) => ({ ...i, isPrimary: i.key === key }));
    onChange(next);
  }

  function move(key: string, delta: -1 | 1) {
    const idx = items.findIndex((i) => i.key === key);
    if (idx < 0) return;
    const swap = idx + delta;
    if (swap < 0 || swap >= items.length) return;
    const next = items.slice();
    [next[idx], next[swap]] = [next[swap], next[idx]];
    onChange(next);
  }

  const slotsLeft = Math.max(0, MAX_IMAGES - items.length);
  const surfaceError = errorMessage ?? localError;

  return (
    <div className="flex flex-col gap-4">
      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-3 max-md:grid-cols-2 sm:grid-cols-4">
          {items.map((item, idx) => (
            <Thumbnail
              key={item.key}
              item={item}
              index={idx}
              total={items.length}
              onRemove={() => remove(item.key)}
              onSetPrimary={() => setPrimary(item.key)}
              onMoveUp={() => move(item.key, -1)}
              onMoveDown={() => move(item.key, 1)}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={handleFiles}
          disabled={slotsLeft === 0}
          className="font-mono text-[12px] text-ink"
        />
        <span className="type-data-mono text-ink-muted">
          {items.length} of {MAX_IMAGES} images · JPEG, PNG, or WebP · 8 MB max each
          {slotsLeft === 0 ? ' · limit reached' : ''}
        </span>
        {surfaceError && (
          <span className="type-data-mono text-accent" role="alert">
            {surfaceError}
          </span>
        )}
      </div>
    </div>
  );
}

function Thumbnail({
  item,
  index,
  total,
  onRemove,
  onSetPrimary,
  onMoveUp,
  onMoveDown,
}: {
  item: ImageItem;
  index: number;
  total: number;
  onRemove: () => void;
  onSetPrimary: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div
      className="relative bg-paper-2 flex flex-col"
      style={{
        border: item.isPrimary
          ? '1px solid var(--color-ink)'
          : '1px solid var(--rule-strong)',
      }}
    >
      <div className="relative w-full" style={{ aspectRatio: '1 / 1' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.previewUrl}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            padding: 6,
          }}
        />
        {item.isPrimary && (
          <span
            className="absolute top-1 left-1 type-data-mono text-cream"
            style={{
              background: 'var(--color-ink)',
              padding: '2px 6px',
              fontSize: '10px',
              letterSpacing: '0.08em',
            }}
          >
            PRIMARY
          </span>
        )}
        {item.kind === 'new' && (
          <span
            className="absolute bottom-1 left-1 type-data-mono text-ink"
            style={{
              background: 'var(--color-cream)',
              padding: '2px 6px',
              fontSize: '10px',
              letterSpacing: '0.08em',
              border: '1px solid var(--rule)',
            }}
          >
            NEW
          </span>
        )}
      </div>

      <div
        className="flex items-stretch justify-between"
        style={{ borderTop: '1px solid var(--rule)' }}
      >
        <div className="flex">
          <ThumbBtn
            label="Move left"
            disabled={index === 0}
            onClick={onMoveUp}
            text="←"
          />
          <ThumbBtn
            label="Move right"
            disabled={index === total - 1}
            onClick={onMoveDown}
            text="→"
          />
        </div>
        <div className="flex">
          <ThumbBtn
            label={item.isPrimary ? 'Primary' : 'Set as primary'}
            disabled={item.isPrimary}
            onClick={onSetPrimary}
            text="★"
          />
          <ThumbBtn label="Remove" onClick={onRemove} text="×" accent />
        </div>
      </div>
    </div>
  );
}

function ThumbBtn({
  label,
  text,
  disabled,
  accent,
  onClick,
}: {
  label: string;
  text: string;
  disabled?: boolean;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`font-mono text-[13px] transition-colors duration-150 ${
        disabled ? 'opacity-30 cursor-not-allowed' : 'hover:bg-cream'
      } ${accent ? 'text-accent' : 'text-ink'}`}
      style={{
        padding: '6px 9px',
        borderLeft: '1px solid var(--rule)',
        background: 'transparent',
      }}
    >
      {text}
    </button>
  );
}

function makeKey(): string {
  // crypto.randomUUID isn't safe for older Safari; fall back to a quick rand.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
