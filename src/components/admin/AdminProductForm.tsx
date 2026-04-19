'use client';

import { useState } from 'react';

type Props = {
  productId: string;
  initialName: string;
  initialRetailPrice: number;
  initialWholesaleCost: number | null;
  initialIsActive: boolean;
  initialIsFeatured: boolean;
  initialStockStatus: string;
  initialShortDescription: string;
};

const STOCK_OPTIONS = ['in_stock', 'out_of_stock', 'discontinued'];

export function AdminProductForm(props: Props) {
  const [retail, setRetail] = useState(props.initialRetailPrice.toFixed(2));
  const [wholesale, setWholesale] = useState(
    props.initialWholesaleCost != null ? props.initialWholesaleCost.toFixed(2) : '',
  );
  const [isActive, setIsActive] = useState(props.initialIsActive);
  const [isFeatured, setIsFeatured] = useState(props.initialIsFeatured);
  const [stockStatus, setStockStatus] = useState(props.initialStockStatus);
  const [shortDesc, setShortDesc] = useState(props.initialShortDescription);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/products/${encodeURIComponent(props.productId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          retail_price: Number(retail),
          wholesale_cost: wholesale ? Number(wholesale) : null,
          is_active: isActive,
          is_featured: isFeatured,
          stock_status: stockStatus,
          short_description: shortDesc,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.errorMessage ?? 'Save failed');
      } else {
        setMessage('Saved.');
      }
    } catch (e) {
      console.error('[admin product save]', e);
      setMessage('Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  const retailN = Number(retail);
  const wholesaleN = wholesale ? Number(wholesale) : null;
  const margin =
    wholesaleN != null && retailN > 0 ? ((retailN - wholesaleN) / retailN) * 100 : null;

  return (
    <form
      onSubmit={save}
      className="bg-cream"
      style={{ border: '1px solid var(--rule-strong)', padding: '24px 26px' }}
    >
      <p className="type-label text-ink mb-4">§&nbsp;&nbsp;Edit</p>

      <div className="grid gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Retail price" value={retail} onChange={setRetail} inputMode="decimal" prefix="$" />
          <Field
            label="Wholesale cost"
            value={wholesale}
            onChange={setWholesale}
            inputMode="decimal"
            prefix="$"
            placeholder="optional"
          />
        </div>

        {margin != null && (
          <p className="type-data-mono text-ink-muted">
            Margin: {margin.toFixed(1)}% · ${(retailN - (wholesaleN ?? 0)).toFixed(2)} per unit
          </p>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="stock_status" className="type-label-sm text-ink">
            Stock status
          </label>
          <select
            id="stock_status"
            value={stockStatus}
            onChange={(e) => setStockStatus(e.target.value)}
            className="bg-cream text-ink font-display"
            style={{
              border: '1px solid var(--rule-strong)',
              padding: '10px 14px',
              fontSize: '14px',
              minHeight: 44,
            }}
          >
            {STOCK_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-5 flex-wrap">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            <span className="type-label text-ink">Active (visible on site)</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isFeatured}
              onChange={(e) => setIsFeatured(e.target.checked)}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            <span className="type-label text-ink">Featured</span>
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="short_description" className="type-label-sm text-ink">
            Short description
          </label>
          <textarea
            id="short_description"
            rows={3}
            value={shortDesc}
            onChange={(e) => setShortDesc(e.target.value)}
            className="bg-cream text-ink font-display"
            style={{
              border: '1px solid var(--rule-strong)',
              padding: '10px 14px',
              fontSize: '14px',
              lineHeight: 1.5,
              resize: 'vertical',
            }}
          />
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <button
            type="submit"
            disabled={submitting}
            className={`btn btn-solid ${submitting ? 'opacity-60 cursor-not-allowed' : ''}`}
            style={{ padding: '14px 22px', minHeight: 44 }}
          >
            <span>{submitting ? 'Saving…' : 'Save changes'}</span>
            <span className="btn-arrow" aria-hidden="true">→</span>
          </button>
          {message && (
            <span className="type-data-mono text-ink-muted" role="status">
              {message}
            </span>
          )}
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  inputMode,
  prefix,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: 'decimal' | 'text';
  prefix?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="type-label-sm text-ink">{label}</label>
      <div className="flex items-stretch" style={{ border: '1px solid var(--rule-strong)' }}>
        {prefix && (
          <span
            className="flex items-center justify-center font-display text-ink-muted"
            style={{
              padding: '0 10px',
              fontSize: '15px',
              background: 'var(--color-paper-2)',
              borderRight: '1px solid var(--rule)',
            }}
          >
            {prefix}
          </span>
        )}
        <input
          type="text"
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="bg-cream text-ink font-display flex-1"
          style={{ padding: '10px 14px', fontSize: '15px', minHeight: 44, border: 'none' }}
        />
      </div>
    </div>
  );
}
