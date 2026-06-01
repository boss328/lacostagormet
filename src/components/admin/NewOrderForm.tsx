'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export type NewOrderProductOption = {
  id: string;
  sku: string;
  name: string;
  retailPrice: number;
  brandName: string | null;
};

type LineItem = {
  key: string;
  productId: string;
  quantity: number;
  unitPriceOverride: string; // empty = use retail
  productSearch: string;     // filter text in the picker
};

type Props = {
  products: NewOrderProductOption[];
};

type FieldErrors = Record<string, string>;

const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DC','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM',
  'NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA',
  'WV','WI','WY',
];

let nextKey = 1;
function blankLine(): LineItem {
  return {
    key: `line-${nextKey++}`,
    productId: '',
    quantity: 1,
    unitPriceOverride: '',
    productSearch: '',
  };
}

export function NewOrderForm({ products }: Props) {
  const router = useRouter();

  const [customerEmail, setCustomerEmail] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [company, setCompany] = useState('');
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [city, setCity] = useState('');
  const [stateCode, setStateCode] = useState('CA');
  const [zip, setZip] = useState('');
  const [phone, setPhone] = useState('');

  const [items, setItems] = useState<LineItem[]>(() => [blankLine()]);

  const [shippingOverride, setShippingOverride] = useState('');
  const [markAsPaid, setMarkAsPaid] = useState(true);
  const [sendCustomerEmail, setSendCustomerEmail] = useState(true);
  const [adminNote, setAdminNote] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);

  const productsById = useMemo(() => {
    const m = new Map<string, NewOrderProductOption>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  function updateLine(key: string, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function removeLine(key: string) {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  }
  function addLine() {
    setItems((prev) => [...prev, blankLine()]);
  }

  // ── Totals preview ────────────────────────────────────────────────
  const subtotal = items.reduce((s, l) => {
    const p = productsById.get(l.productId);
    if (!p) return s;
    const override = parseFloat(l.unitPriceOverride);
    const unit = Number.isFinite(override) && override >= 0 ? override : p.retailPrice;
    return s + unit * l.quantity;
  }, 0);
  const shippingPreview = parseFloat(shippingOverride);
  const shippingDisplay =
    Number.isFinite(shippingPreview) && shippingPreview >= 0
      ? shippingPreview
      : null; // server computes if blank
  const totalPreview =
    shippingDisplay != null ? subtotal + shippingDisplay : subtotal;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);

    const next: FieldErrors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())) {
      next.customerEmail = 'Valid customer email required.';
    }
    if (!firstName.trim()) next['shipping.firstName'] = 'Required.';
    if (!lastName.trim()) next['shipping.lastName'] = 'Required.';
    if (!address1.trim()) next['shipping.address1'] = 'Required.';
    if (!city.trim()) next['shipping.city'] = 'Required.';
    if (!/^[A-Z]{2}$/.test(stateCode)) next['shipping.state'] = 'Pick a state.';
    if (!/^\d{5}(-\d{4})?$/.test(zip.trim())) next['shipping.zip'] = 'ZIP like 92011 or 92011-0123.';
    if (!phone.trim()) next['shipping.phone'] = 'Required.';

    const cleanItems = items.filter((l) => l.productId);
    if (cleanItems.length === 0) next.items = 'Add at least one line item.';
    cleanItems.forEach((l, idx) => {
      if (!Number.isInteger(l.quantity) || l.quantity <= 0) {
        next[`items.${idx}.quantity`] = 'Positive integer.';
      }
      if (l.unitPriceOverride.trim()) {
        const v = Number(l.unitPriceOverride);
        if (!Number.isFinite(v) || v < 0) {
          next[`items.${idx}.unitPrice`] = 'Must be ≥ 0.';
        }
      }
    });

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      const body = {
        customerEmail: customerEmail.trim().toLowerCase(),
        shippingAddress: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          company: company.trim(),
          address1: address1.trim(),
          address2: address2.trim(),
          city: city.trim(),
          state: stateCode,
          zip: zip.trim(),
          phone: phone.trim(),
        },
        items: cleanItems.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPriceOverride.trim()
            ? Number(l.unitPriceOverride)
            : undefined,
        })),
        shippingCostOverride: shippingOverride.trim()
          ? Number(shippingOverride)
          : undefined,
        markAsPaid,
        sendCustomerEmail: markAsPaid && sendCustomerEmail,
        adminNote: adminNote.trim() || undefined,
      };

      const res = await fetch('/api/admin/orders/create/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        errorMessage?: string;
        fieldErrors?: FieldErrors;
        order?: { order_number: string };
      };

      if (!res.ok || !data.ok) {
        if (data.fieldErrors) setErrors(data.fieldErrors);
        else setErrors({ general: data.errorMessage ?? 'Could not create order.' });
        setSubmitting(false);
        return;
      }

      setMessage(`Order ${data.order?.order_number} created.`);
      setTimeout(() => {
        if (data.order?.order_number) {
          router.push(`/admin/orders/${data.order.order_number}/`);
        } else {
          router.push('/admin/orders/');
        }
        router.refresh();
      }, 700);
    } catch (e) {
      console.error('[admin/orders/new]', e);
      setErrors({ general: 'Network error.' });
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-10 lg:grid-cols-[1fr_320px] max-lg:gap-6">
      <div className="flex flex-col gap-8">
        {message && (
          <div className="bg-cream" style={{ border: '1px solid var(--rule-strong)', padding: '14px 18px' }} role="status">
            <p className="type-data-mono text-gold">{message}</p>
          </div>
        )}
        {errors.general && (
          <div className="bg-cream" style={{ border: '1px solid var(--accent)', padding: '14px 18px' }} role="alert">
            <p className="type-data-mono text-accent">{errors.general}</p>
          </div>
        )}

        <Section title="Customer">
          <Field
            label="Email"
            required
            error={errors.customerEmail}
            hint="Magic-link login + order-confirmation email use this address."
            input={
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                maxLength={200}
                className={inputClass}
                style={inputStyle}
                placeholder="customer@example.com"
              />
            }
          />
        </Section>

        <Section title="Ship to">
          <div className="grid gap-5 max-md:gap-4 sm:grid-cols-2">
            <Field
              label="First name"
              required
              error={errors['shipping.firstName']}
              input={
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={80} className={inputClass} style={inputStyle} />
              }
            />
            <Field
              label="Last name"
              required
              error={errors['shipping.lastName']}
              input={
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={80} className={inputClass} style={inputStyle} />
              }
            />
          </div>
          <Field
            label="Business name (optional)"
            input={
              <input value={company} onChange={(e) => setCompany(e.target.value)} maxLength={120} className={inputClass} style={inputStyle} />
            }
          />
          <Field
            label="Street address"
            required
            error={errors['shipping.address1']}
            input={
              <input value={address1} onChange={(e) => setAddress1(e.target.value)} maxLength={200} className={inputClass} style={inputStyle} />
            }
          />
          <Field
            label="Apt, suite, etc."
            input={
              <input value={address2} onChange={(e) => setAddress2(e.target.value)} maxLength={120} className={inputClass} style={inputStyle} />
            }
          />
          <div className="grid gap-5 max-md:gap-4 sm:grid-cols-[2fr_1fr_1fr]">
            <Field
              label="City"
              required
              error={errors['shipping.city']}
              input={
                <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={100} className={inputClass} style={inputStyle} />
              }
            />
            <Field
              label="State"
              required
              error={errors['shipping.state']}
              input={
                <select value={stateCode} onChange={(e) => setStateCode(e.target.value)} className={inputClass} style={inputStyle}>
                  {STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              }
            />
            <Field
              label="ZIP"
              required
              error={errors['shipping.zip']}
              input={
                <input value={zip} onChange={(e) => setZip(e.target.value)} maxLength={10} className={inputClass} style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} />
              }
            />
          </div>
          <Field
            label="Phone"
            required
            error={errors['shipping.phone']}
            input={
              <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={32} className={inputClass} style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} placeholder="(858) 354-1120" />
            }
          />
        </Section>

        <Section title="Line items">
          {errors.items && <p className="type-data-mono text-accent" role="alert">{errors.items}</p>}
          <div className="flex flex-col gap-4">
            {items.map((line, idx) => {
              const selected = productsById.get(line.productId);
              const filtered = line.productId
                ? []
                : products
                    .filter((p) => {
                      const q = line.productSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        p.name.toLowerCase().includes(q) ||
                        p.sku.toLowerCase().includes(q) ||
                        (p.brandName?.toLowerCase().includes(q) ?? false)
                      );
                    })
                    .slice(0, 8);
              const override = parseFloat(line.unitPriceOverride);
              const unit = selected
                ? Number.isFinite(override) && override >= 0
                  ? override
                  : selected.retailPrice
                : 0;
              const lineTotal = unit * line.quantity;

              return (
                <div
                  key={line.key}
                  className="bg-paper-2"
                  style={{ border: '1px solid var(--rule)', padding: '14px 16px' }}
                >
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="type-label-sm text-ink-muted">Line {idx + 1}</p>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(line.key)}
                        className="type-label-sm text-accent hover:underline"
                      >
                        × Remove
                      </button>
                    )}
                  </div>

                  {selected ? (
                    <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="font-display text-ink truncate" style={{ fontSize: '15px' }}>{selected.name}</p>
                        <p className="font-mono text-ink-muted" style={{ fontSize: '11px' }}>
                          SKU {selected.sku}
                          {selected.brandName ? ` · ${selected.brandName}` : ''}
                          {' · '}retail ${selected.retailPrice.toFixed(2)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateLine(line.key, { productId: '', unitPriceOverride: '', productSearch: '' })}
                        className="type-label-sm text-ink-muted hover:text-accent"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <div className="mb-3">
                      <input
                        type="text"
                        value={line.productSearch}
                        onChange={(e) => updateLine(line.key, { productSearch: e.target.value })}
                        placeholder="Search by name, SKU, or brand…"
                        className={inputClass}
                        style={inputStyle}
                      />
                      {filtered.length > 0 && (
                        <ul
                          className="mt-2 max-h-[260px] overflow-y-auto bg-cream"
                          style={{ border: '1px solid var(--rule)' }}
                        >
                          {filtered.map((p) => (
                            <li key={p.id}>
                              <button
                                type="button"
                                onClick={() => updateLine(line.key, { productId: p.id, productSearch: '' })}
                                className="w-full text-left transition-colors hover:bg-paper-2"
                                style={{ padding: '10px 12px', borderBottom: '1px solid var(--rule)' }}
                              >
                                <p className="font-display text-ink" style={{ fontSize: '14px' }}>{p.name}</p>
                                <p className="font-mono text-ink-muted" style={{ fontSize: '10.5px' }}>
                                  SKU {p.sku}
                                  {p.brandName ? ` · ${p.brandName}` : ''}
                                  {' · $'}{p.retailPrice.toFixed(2)}
                                </p>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <div className="grid gap-3 max-md:grid-cols-1 sm:grid-cols-[120px_140px_1fr]">
                    <Field
                      label="Qty"
                      required
                      error={errors[`items.${idx}.quantity`]}
                      input={
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          step={1}
                          value={line.quantity}
                          onChange={(e) =>
                            updateLine(line.key, {
                              quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                            })
                          }
                          className={inputClass}
                          style={inputStyle}
                        />
                      }
                    />
                    <Field
                      label="Price override"
                      hint={selected ? `Default $${selected.retailPrice.toFixed(2)}` : ' '}
                      error={errors[`items.${idx}.unitPrice`]}
                      input={
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          value={line.unitPriceOverride}
                          onChange={(e) => updateLine(line.key, { unitPriceOverride: e.target.value })}
                          placeholder="optional"
                          className={inputClass}
                          style={inputStyle}
                          disabled={!selected}
                        />
                      }
                    />
                    <div className="flex flex-col gap-2 justify-end">
                      <span className="type-label-sm text-ink-muted">Line total</span>
                      <span className="font-display text-ink" style={{ fontSize: '16px' }}>
                        {selected ? `$${lineTotal.toFixed(2)}` : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={addLine}
            className="type-label-sm text-brand-deep hover:underline self-start"
          >
            + Add another line
          </button>
        </Section>

        <Section title="Shipping & totals">
          <Field
            label="Shipping cost (override)"
            hint="Leave blank to auto-compute from subtotal + state."
            input={
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={shippingOverride}
                onChange={(e) => setShippingOverride(e.target.value)}
                placeholder="auto"
                className={inputClass}
                style={inputStyle}
              />
            }
          />
        </Section>

        <Section title="Payment">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={markAsPaid}
              onChange={(e) => setMarkAsPaid(e.target.checked)}
              className="accent-brand-deep"
              style={{ width: 16, height: 16 }}
            />
            <span className="font-display text-ink-2" style={{ fontSize: '14px' }}>
              Mark as paid (capture handled offline in Auth.net or by invoice)
            </span>
          </label>
          <label className={`flex items-center gap-3 cursor-pointer select-none ${markAsPaid ? '' : 'opacity-60'}`}>
            <input
              type="checkbox"
              checked={sendCustomerEmail}
              onChange={(e) => setSendCustomerEmail(e.target.checked)}
              disabled={!markAsPaid}
              className="accent-brand-deep"
              style={{ width: 16, height: 16 }}
            />
            <span className="font-display text-ink-2" style={{ fontSize: '14px' }}>
              Send order confirmation email to customer
            </span>
          </label>
        </Section>

        <Section title="Admin note (optional)">
          <Field
            label="Note"
            hint="Saved on the order; never shown to the customer."
            input={
              <textarea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                maxLength={1000}
                rows={3}
                className={inputClass}
                style={inputStyle}
                placeholder="e.g. Phone order, $200 quoted to existing customer, paid via check."
              />
            }
          />
        </Section>
      </div>

      <aside className="flex flex-col gap-3 self-start lg:sticky lg:top-6">
        <div className="bg-cream" style={{ border: '1px solid var(--rule-strong)', padding: '20px 22px' }}>
          <p className="type-label text-ink mb-3">§ Summary</p>
          <dl className="flex flex-col gap-2">
            <Stat label="Email" value={customerEmail || '—'} />
            <Stat label="Items" value={`${items.filter((l) => l.productId).length} of ${items.length}`} />
            <Stat label="Subtotal" value={`$${subtotal.toFixed(2)}`} />
            <Stat
              label="Shipping"
              value={shippingDisplay != null ? `$${shippingDisplay.toFixed(2)}` : 'auto on submit'}
            />
            <Stat label="Total (est.)" value={`$${totalPreview.toFixed(2)}`} />
            <Stat label="Status" value={markAsPaid ? 'paid' : 'pending'} mono />
          </dl>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className={`btn btn-solid w-full justify-center ${submitting ? 'opacity-60 cursor-wait' : ''}`}
          style={{ padding: '16px 22px' }}
        >
          <span>{submitting ? 'Placing…' : 'Place order'}</span>
          {!submitting && <span className="btn-arrow" aria-hidden="true">→</span>}
        </button>
        <Link
          href="/admin/orders/"
          className="type-label-sm text-ink-muted hover:text-brand-deep text-center"
        >
          Cancel
        </Link>
      </aside>
    </form>
  );
}

/* ─── Layout helpers (mirror EditProductForm.tsx) ────────────────────── */

const inputClass =
  'bg-paper text-ink font-display focus:outline-none focus:border-brand-deep transition-colors duration-200';

const inputStyle: React.CSSProperties = {
  border: '1px solid var(--rule-strong)',
  padding: '11px 14px',
  fontSize: '14px',
  lineHeight: 1.4,
  width: '100%',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="pb-3" style={{ borderBottom: '1px solid var(--rule)' }}>
        <p className="type-label text-ink">§ {title}</p>
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  required,
  error,
  hint,
  input,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  input: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="type-label-sm text-ink">
        {label}
        {required && <span className="text-accent ml-1" aria-hidden="true">*</span>}
      </label>
      {input}
      {hint && !error && <span className="type-data-mono text-ink-muted">{hint}</span>}
      {error && <span className="type-data-mono text-accent" role="alert">{error}</span>}
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="type-data-mono text-ink-muted">{label}</dt>
      <dd
        className={`text-right truncate min-w-0 ${mono ? 'font-mono text-[12px]' : 'font-display text-[14px]'} text-ink`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
