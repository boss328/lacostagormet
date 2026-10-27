'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { packUnitPrice, type PackOptionsResponse } from '@/lib/product-packs';
import { STOCK_STATUS_OPTIONS } from '@/lib/product-availability';
import { slugify } from '@/lib/admin/slug';
import { suggestPackPrice } from './pack-options-input';
import { packUnitSize } from '@/lib/product-pack-options';

type ApiError = { errorMessage?: string; error?: string; fieldErrors?: Record<string, string> };
const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const inputClass = 'w-full rounded-md border border-rule-strong bg-paper px-3 py-2.5 text-sm text-ink focus:border-brand-deep focus:outline-none disabled:opacity-60';

function errorMessage(data: ApiError, fallback: string): string {
  return data.errorMessage || data.error || Object.values(data.fieldErrors ?? {}).filter(Boolean).join(' ') || fallback;
}

/** Pack options are real products, so prices, images and shipping stay specific to each SKU. */
export function ProductPackOptions({ productId }: { productId: string }) {
  const [data, setData] = useState<PackOptionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [createdId, setCreatedId] = useState('');
  const [parentUnits, setParentUnits] = useState('');
  const [unitLabel, setUnitLabel] = useState('');
  const [optionUnitLabel, setOptionUnitLabel] = useState('bag');
  const [netAmount, setNetAmount] = useState('');
  const [netMeasure, setNetMeasure] = useState('oz');
  const [showCreate, setShowCreate] = useState(false);
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [units, setUnits] = useState('1');
  const [price, setPrice] = useState('');
  const [markup, setMarkup] = useState('10');
  const [weight, setWeight] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [stockStatus, setStockStatus] = useState('out_of_stock');
  const [isActive, setIsActive] = useState(false);
  const endpoint = `/api/admin/products/${productId}/pack-options/`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      const result = await response.json() as PackOptionsResponse & ApiError;
      if (!response.ok || !result.ok) throw new Error(errorMessage(result, 'Could not load pack options.'));
      setData(result);
      const parent = result.options.find(option => option.id === result.parentId);
      setParentUnits(String(parent?.units_per_pack ?? ''));
      setUnitLabel(parent?.pack_unit_label ?? 'unit');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load pack options.');
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);

  const parent = data?.options.find(option => option.id === data.parentId);
  const basePrice = Number(parent?.retail_price ?? 0);
  const baseUnitPrice = packUnitPrice(basePrice, Number(parentUnits));
  const newUnitPrice = packUnitPrice(Number(price), Number(units));
  const optionPackSize = `${Number(units)} × ${Number(netAmount)} ${netMeasure}`;
  const sameContents = parent && optionUnitLabel.trim().toLowerCase() === parent.pack_unit_label?.toLowerCase()
    && packUnitSize(parent.pack_size, parent.units_per_pack ?? 0) !== null
    && packUnitSize(parent.pack_size, parent.units_per_pack ?? 0) === packUnitSize(optionPackSize, Number(units));
  const suggestedPrice = sameContents ? suggestPackPrice(basePrice, Number(parentUnits), Number(units), Number(markup)) : null;
  const hasChildren = (data?.options.length ?? 0) > 1;
  const selectedVendor = data?.vendors.find(vendor => vendor.id === vendorId);

  async function saveConfiguration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/admin/products/${data.parentId}/pack-options/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ units_per_pack: Number(parentUnits), pack_unit_label: unitLabel.trim() }),
      });
      const result = await response.json() as ApiError & { ok?: boolean };
      if (!response.ok || !result.ok) throw new Error(errorMessage(result, 'Could not save pack settings.'));
      setMessage('Pack settings saved.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save pack settings.');
    } finally { setBusy(false); }
  }

  async function createOption(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    setCreatedId('');
    try {
      const response = await fetch(`/api/admin/products/${data.parentId}/pack-options/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: sku.trim(), name: name.trim(), slug: slugify(name),
          retail_price: Number(price), units_per_pack: Number(units),
          parent_units_per_pack: Number(parentUnits), parent_pack_unit_label: unitLabel.trim(),
          pack_unit_label: optionUnitLabel.trim(), pack_size: optionPackSize,
          weight_lb: Number(weight), vendor_id: vendorId, description: description.trim(),
          ...(imageUrl ? { primary_image_url: imageUrl } : {}),
          stock_status: stockStatus, is_active: isActive,
        }),
      });
      const result = await response.json() as ApiError & { ok?: boolean; product?: { id: string } };
      if (!response.ok || !result.ok) throw new Error(errorMessage(result, 'Could not create pack option.'));
      setMessage(`${name.trim()} created. Open its product editor to upload a pack-specific photo and finish setup.`);
      setCreatedId(result.product?.id ?? '');
      setShowCreate(false);
      setSku(''); setName(''); setPrice(''); setWeight(''); setDescription(''); setImageUrl(''); setNetAmount('');
      setStockStatus('out_of_stock'); setIsActive(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create pack option.');
    } finally { setBusy(false); }
  }

  return (
    <section id="pack-options" className="mt-12 scroll-mt-8 border-t border-rule-strong pt-8" aria-labelledby="pack-options-title">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 id="pack-options-title" className="font-display text-2xl tracking-tight text-ink">Pack options</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Offer bags, cans and cases together. Each size has its own SKU, net contents, price, photo, availability and shipping details.
          </p>
        </div>
        {data && !showCreate && <button type="button" className="btn btn-solid" disabled={busy} onClick={() => { setOptionUnitLabel(unitLabel || 'bag'); setShowCreate(true); setError(''); setMessage(''); }}>Add pack option <span aria-hidden="true">＋</span></button>}
      </div>

      {error && <div role="alert" className="mb-5 rounded-md border border-accent p-4 text-sm text-accent">{error}</div>}
      {message && <div role="status" className="mb-5 rounded-md border border-rule bg-cream p-4 text-sm text-ink">{message}{createdId && <Link className="ml-2 underline underline-offset-4" href={`/admin/products/${createdId}/`}>Edit new pack →</Link>}</div>}
      {!data && (loading ? <p role="status" className="text-sm text-ink-muted">Loading pack options…</p> : <button type="button" className="btn btn-outline" onClick={() => { setError(''); void load(); }}>Try again</button>)}

      {data && parent && <>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(240px,320px)]">
          <div className="overflow-hidden rounded-lg border border-rule">
            <div className="border-b border-rule bg-cream px-5 py-3 text-xs uppercase tracking-wider text-ink-muted">Current pack options</div>
            <ul className="divide-y divide-rule">
              {data.options.map(option => {
                const unitPrice = packUnitPrice(Number(option.retail_price), option.units_per_pack);
                return <li key={option.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <Link href={`/admin/products/${option.id}/`} className="font-display text-base text-ink hover:text-brand-deep">{option.name}</Link>
                    <p className="mt-1 text-xs text-ink-muted">{option.sku} · {option.pack_size || (option.units_per_pack ? `${option.units_per_pack}-pack` : 'Pack count not set')} · {option.is_active ? STOCK_STATUS_OPTIONS.find(status => status.value === option.stock_status)?.label ?? option.stock_status : 'Hidden from storefront'}{option.id === data.parentId ? ' · Base product' : ''}</p>
                    <Link href={`/admin/products/${option.id}/#inventory`} aria-label={`Manage stock for ${option.sku}`} className="mt-2 inline-block text-xs text-brand-deep underline underline-offset-4">Manage stock →</Link>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-ink">{money(Number(option.retail_price))}</p>
                    <p className="mt-1 text-xs text-ink-muted">{unitPrice === null ? '—' : money(unitPrice)} / {option.pack_unit_label || 'unit'}</p>
                  </div>
                </li>;
              })}
            </ul>
          </div>

          <form onSubmit={saveConfiguration} className="space-y-4 rounded-lg border border-rule bg-cream p-5">
            <h3 className="type-label text-ink">Base pack settings</h3>
            <p className="text-xs leading-relaxed text-ink-muted">The base product is {parent.sku}. Its saved price is {money(basePrice)}.</p>
            <Field label="Units in the base pack" id="pack-parent-units" hint={hasChildren ? 'The count is fixed once another pack option exists.' : 'Enter the number of individual bags, bottles or units in this SKU.'}>
              <input id="pack-parent-units" type="number" min="1" max="1000" step="1" required value={parentUnits} disabled={hasChildren || busy} onChange={event => setParentUnits(event.target.value)} className={inputClass} />
            </Field>
            <Field label="Base unit name (singular)" id="pack-unit-label" hint="For example: bag, can or bottle. Applies only to the base product.">
              <input id="pack-unit-label" required pattern="[a-zA-Z][a-zA-Z -]*" maxLength={30} value={unitLabel} disabled={busy} onChange={event => setUnitLabel(event.target.value)} className={inputClass} />
            </Field>
            <p className="text-sm text-ink">{baseUnitPrice === null ? 'Enter a pack count to compare pricing.' : `${money(baseUnitPrice)} per ${unitLabel || 'unit'}`}</p>
            <button type="submit" disabled={busy || loading} className="btn btn-outline w-full justify-center">{busy ? 'Saving…' : 'Save pack settings'}</button>
          </form>
        </div>

        {showCreate && <form onSubmit={createOption} className="mt-7 rounded-lg border border-rule-strong p-5 sm:p-7">
          <fieldset disabled={busy} className="space-y-6 disabled:opacity-70">
            <legend className="mb-2 font-display text-xl text-ink">New pack option</legend>
            <p className="text-sm text-ink-muted">Use the actual contents and shipping weight for this pack. Brand and categories carry over from the base product.</p>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Product name" id="pack-name" hint="Include the correct pack size, such as “Vanilla Latte Mix — 1 bag”."><input id="pack-name" required minLength={2} maxLength={200} value={name} onChange={event => setName(event.target.value)} className={inputClass} /></Field>
              <Field label="Unique SKU" id="pack-sku"><input id="pack-sku" required pattern="[a-zA-Z0-9_-]{2,50}" maxLength={50} value={sku} onChange={event => setSku(event.target.value)} className={inputClass} /></Field>
              <Field label="Units in this pack" id="pack-units"><input id="pack-units" type="number" min="1" max="1000" step="1" required value={units} onChange={event => setUnits(event.target.value)} className={inputClass} /></Field>
              <Field label="Packaging for this option" id="pack-option-label" hint="Singular name, such as bag, can or bottle."><input id="pack-option-label" required pattern="[a-zA-Z][a-zA-Z -]*" maxLength={30} value={optionUnitLabel} onChange={event => setOptionUnitLabel(event.target.value)} className={inputClass} /></Field>
              <Field label="Net contents per unit" id="pack-net-amount" hint="Contents of one bag or can, excluding the packaging."><input id="pack-net-amount" type="number" min="0.001" step="any" required value={netAmount} onChange={event => setNetAmount(event.target.value)} className={inputClass} /></Field>
              <Field label="Net contents measurement" id="pack-net-measure"><select id="pack-net-measure" value={netMeasure} onChange={event => setNetMeasure(event.target.value)} className={inputClass}>{['oz', 'lb', 'fl oz', 'g', 'kg', 'ml', 'l'].map(measure => <option key={measure} value={measure}>{measure}</option>)}</select></Field>
              <Field label="Pack price (USD)" id="pack-price" hint={newUnitPrice === null ? 'The total price customers pay for this pack.' : `${money(newUnitPrice)} per ${optionUnitLabel || 'unit'}`}><input id="pack-price" type="number" min="0.01" step="0.01" required value={price} onChange={event => setPrice(event.target.value)} className={inputClass} /></Field>
            </div>
            <div className="flex flex-wrap items-end gap-4 rounded-md bg-cream p-4">
              <div className="min-w-[160px] flex-1"><label htmlFor="pack-markup" className="mb-2 block text-sm text-ink">Optional premium over base unit price</label><div className="flex items-center gap-2"><input id="pack-markup" type="number" min="0" max="1000" step="0.1" value={markup} onChange={event => setMarkup(event.target.value)} className={`${inputClass} max-w-[100px]`} /><span className="text-sm">%</span></div></div>
              <p className="text-sm text-ink-muted">Suggested pack price: <strong className="font-medium text-ink">{suggestedPrice === null ? '—' : money(suggestedPrice)}</strong></p>
              <button type="button" className="btn btn-outline" disabled={suggestedPrice === null} onClick={() => { if (suggestedPrice !== null) setPrice(suggestedPrice.toFixed(2)); }}>Use suggested price</button>
              <p className="w-full text-xs text-ink-muted">{sameContents ? 'The suggestion only fills this pack’s price. Review it before saving.' : 'Enter a price for this size. Suggestions apply only when packaging and net contents per unit match the base product.'}</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Shipping weight (lb)" id="pack-weight" hint="Weigh this pack; do not reuse the full case weight for a single."><input id="pack-weight" type="number" min="0.01" step="0.01" required value={weight} onChange={event => setWeight(event.target.value)} className={inputClass} /></Field>
              <Field label="Ships from" id="pack-vendor" hint={selectedVendor?.is_self_fulfilled ? 'Ships from your location using this vendor’s primary warehouse.' : 'Choose your local fulfillment vendor for stock you ship yourself.'}><select id="pack-vendor" required value={vendorId} onChange={event => setVendorId(event.target.value)} className={inputClass}><option value="">Choose fulfillment vendor…</option>{data.vendors.map(vendor => <option key={vendor.id} value={vendor.id}>{vendor.name}{vendor.is_self_fulfilled ? ' · Your location' : ' · Supplier'}</option>)}</select></Field>
            </div>
            <Field label="Description for this pack" id="pack-description" hint="Describe the actual quantity and size. Remove any case-only claims for a single."><textarea id="pack-description" required minLength={10} maxLength={5000} rows={3} value={description} onChange={event => setDescription(event.target.value)} className={inputClass} /></Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Starting photo" id="pack-image" hint="Only reuse a photo if it shows the right number of units. Upload a new photo from this pack’s editor after creating it."><select id="pack-image" value={imageUrl} onChange={event => setImageUrl(event.target.value)} className={inputClass}><option value="">No photo yet — upload after creating</option>{data.images.map((image, index) => <option key={image.id} value={image.url}>{image.alt_text || `Existing product photo ${index + 1}`}</option>)}</select></Field>
              <Field label="Stock status" id="pack-stock"><select id="pack-stock" value={stockStatus} onChange={event => setStockStatus(event.target.value)} className={inputClass}>{STOCK_STATUS_OPTIONS.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}</select></Field>
            </div>
            {imageUrl && <div className="flex items-center gap-4 rounded-md border border-rule p-3">
              {/* The admin preview shows the original uploaded image. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="Selected pack photo preview" className="h-24 w-24 rounded bg-white object-contain" />
              <p className="text-xs text-ink-muted">Confirm the photo matches this pack’s contents.</p>
            </div>}
            <label className="flex items-start gap-3 text-sm text-ink"><input type="checkbox" checked={isActive} onChange={event => setIsActive(event.target.checked)} className="mt-0.5 accent-brand-deep" /><span>Visible on storefront<span className="mt-1 block text-xs text-ink-muted">Leave unchecked until the price, photo and fulfillment details are ready.</span></span></label>
            <div className="flex flex-wrap items-center gap-4 border-t border-rule pt-5"><button type="submit" className="btn btn-solid">{busy ? 'Creating…' : 'Create pack option'} <span aria-hidden="true">→</span></button><button type="button" className="text-sm text-ink-muted hover:text-ink" onClick={() => setShowCreate(false)}>Cancel</button></div>
          </fieldset>
        </form>}
      </>}
    </section>
  );
}

function Field({ label, id, hint, children }: { label: string; id: string; hint?: string; children: ReactNode }) {
  return <div className="space-y-2"><label htmlFor={id} className="block text-sm font-medium text-ink">{label}</label>{children}{hint && <p className="text-xs leading-relaxed text-ink-muted">{hint}</p>}</div>;
}
