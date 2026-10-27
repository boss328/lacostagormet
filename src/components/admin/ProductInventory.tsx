'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

type Inventory = { on_hand: number; reserved: number; low_stock_threshold: number };
type Movement = {
  id: string;
  action: string;
  quantity: number;
  on_hand_after: number;
  reserved_after: number;
  reason: string;
  created_at: string;
  order_id: string | null;
};
type InventoryResponse = {
  ok: boolean;
  errorMessage?: string;
  product: { id: string; sku: string; name: string; stock_status: string; weight_lb: number | null; preferred_vendor_id: string | null };
  inventory: Inventory | null;
  movements: Movement[];
  vendors: Array<{ id: string; name: string; is_self_fulfilled: boolean }>;
};
type Action = 'start' | 'add' | 'remove';
type Adjustment = { action: Action; quantity: number; reason: string; requestId: string };

const inputClass = 'w-full rounded-md border border-rule-strong bg-paper px-3 py-2.5 text-sm text-ink focus:border-brand-deep focus:outline-none disabled:opacity-60';
const actionLabels: Record<string, string> = {
  start: 'Starting count', add: 'Stock added', remove: 'Stock removed', reserve: 'Reserved for payment',
  commit: 'Order deduction', release: 'Reservation released', restock: 'Stock returned',
};

export function ProductInventory({ productId, sku }: { productId: string; sku: string }) {
  const router = useRouter();
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [action, setAction] = useState<'add' | 'remove'>('add');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [weightLb, setWeightLb] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const pending = useRef<Adjustment | null>(null);
  const submitting = useRef(false);
  const shippingDirty = useRef(false);
  const endpoint = `/api/admin/products/${productId}/inventory/`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      const result = await response.json() as InventoryResponse;
      if (!response.ok || !result.ok) throw new Error(result.errorMessage || 'Could not load stock.');
      setData(result);
      setLoadFailed(false);
      if (!shippingDirty.current) {
        setVendorId(result.product.preferred_vendor_id || '');
        setWeightLb(result.product.weight_lb == null ? '' : String(result.product.weight_lb));
      }
      window.dispatchEvent(new CustomEvent('product-inventory-updated', {
        detail: { productId, tracked: result.inventory !== null, stockStatus: result.product.stock_status, weightLb: result.product.weight_lb },
      }));
      return true;
    } catch (caught) {
      setLoadFailed(true);
      setError(caught instanceof Error ? caught.message : 'Could not load stock.');
      return false;
    } finally { setLoading(false); }
  }, [endpoint, productId]);

  useEffect(() => { void load(); }, [load]);

  async function saveShipping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || submitting.current || uncertain || loadFailed) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId, weightLb: Number(weightLb) }),
      });
      const result = await response.json() as { ok?: boolean; errorMessage?: string };
      if (!response.ok || !result.ok) throw new Error(result.errorMessage || 'Could not save shipping details.');
      shippingDirty.current = false;
      setMessage('Shipping details saved.');
      await load();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not confirm shipping details. Retry to save the same details.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function adjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || submitting.current || loadFailed) return;
    const nextAction = data.inventory ? action : 'start';
    const count = Number(quantity);
    if (!pending.current && (quantity.trim() === '' || !Number.isSafeInteger(count) || count < (nextAction === 'start' ? 0 : 1) || count > 1_000_000 || reason.trim().length < 3)) {
      setError('Enter a whole number and a reason of at least 3 characters for this stock change.');
      return;
    }
    if (!pending.current) pending.current = { action: nextAction, quantity: count, reason: reason.trim(), requestId: crypto.randomUUID() };
    submitting.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pending.current),
      });
      const result = await response.json() as { ok?: boolean; errorMessage?: string };
      if (!response.ok || !result.ok) {
        // Validation failures are definite. Uncertain writes retain the same request ID on retry.
        if (response.status >= 400 && response.status < 500) pending.current = null;
        throw new Error(result.errorMessage || 'Could not confirm the stock change.');
      }
      pending.current = null;
      setUncertain(false);
      setQuantity('');
      setReason('');
      setMessage('Stock updated.');
      await load();
      router.refresh();
    } catch (caught) {
      setUncertain(pending.current !== null);
      setError(caught instanceof Error ? caught.message : 'Could not confirm the stock change.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const inventory = data?.inventory;
  const available = inventory ? inventory.on_hand - inventory.reserved : 0;
  const missingShipping = Boolean(data && (!data.product.preferred_vendor_id || !(Number(data.product.weight_lb) > 0)));

  return (
    <section id="inventory" aria-labelledby="inventory-title" className="mb-10 scroll-mt-8 rounded-lg border border-rule-strong p-5 sm:p-7">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="inventory-title" className="font-display text-2xl tracking-tight text-ink">Stock for this size</h2>
          <p className="mt-2 text-sm text-ink-muted">SKU {sku} · Counts are separate for every bag, canister and case.</p>
        </div>
        {data && <span className="rounded-full border border-rule px-3 py-1 text-xs text-ink-muted">{inventory ? 'Quantity tracking on' : 'Quantity tracking off'}</span>}
      </div>
      {error && <p role="alert" className="mb-4 rounded-md border border-accent p-3 text-sm text-accent">{error}</p>}
      {message && <p role="status" className="mb-4 rounded-md bg-cream p-3 text-sm text-ink">{message}</p>}
      {data && loadFailed && <button type="button" className="btn btn-outline mb-4" disabled={loading} onClick={() => { setError(''); void load(); }}>Refresh stock before continuing</button>}
      {!data && (loading ? <p role="status" className="text-sm text-ink-muted">Loading stock…</p> : <button type="button" className="btn btn-outline" onClick={() => { setError(''); void load(); }}>Try again</button>)}
      {data && <>
        {inventory ? <dl className="mb-5 grid grid-cols-3 gap-3 rounded-md bg-cream p-4 sm:gap-6 sm:p-5">
          <Count label="On hand" count={inventory.on_hand} />
          <Count label="Reserved" count={inventory.reserved} />
          <Count label="Available" count={available} />
        </dl> : <div className="mb-5 rounded-md bg-cream p-4 text-sm leading-relaxed text-ink-muted">
          <p className="font-medium text-ink">Start with a physical stock count.</p>
          <p className="mt-1">Enter the quantity available for new orders. Exclude anything already set aside for existing paid orders. Nothing is counted until you save the starting quantity.</p>
        </div>}
        <p className="mb-5 text-sm leading-relaxed text-ink-muted">Count this size as sold: one canister is 1; one four-bag case is also 1. Opening a case does not automatically add stock to the single-bag option.</p>
        {missingShipping && <p className="mb-5 rounded-md border border-rule bg-cream p-4 text-sm leading-relaxed text-ink-muted">This size still needs a fulfillment location and packaged shipping weight before it can be sold. Recording a stock count does not complete shipping setup.</p>}
        <details className="mb-6 rounded-md border border-rule p-4" open={missingShipping}>
          <summary className="cursor-pointer text-sm font-medium text-ink">Shipping details for this size</summary>
          <form onSubmit={saveShipping} className="mt-4">
            <fieldset disabled={busy || uncertain || loadFailed} className="grid gap-4 sm:grid-cols-2 disabled:opacity-60">
              <legend className="sr-only">Shipping details</legend>
              <div>
                <label htmlFor="inventory-vendor" className="mb-2 block text-sm font-medium text-ink">Ships from</label>
                <select id="inventory-vendor" required value={vendorId} onChange={event => { shippingDirty.current = true; setVendorId(event.target.value); }} className={inputClass}>
                  <option value="">Choose fulfillment location…</option>
                  {data.vendors.map(vendor => <option key={vendor.id} value={vendor.id}>{vendor.name}{vendor.is_self_fulfilled ? ' · Your location' : ' · Supplier'}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="inventory-weight" className="mb-2 block text-sm font-medium text-ink">Packaged shipping weight (lb)</label>
                <input id="inventory-weight" type="number" min="0.01" max="9999.99" step="0.01" required value={weightLb} onChange={event => { shippingDirty.current = true; setWeightLb(event.target.value); }} className={inputClass} />
                <p className="mt-2 text-xs text-ink-muted">Weigh this exact size with its shipping packaging.</p>
              </div>
            </fieldset>
            <button type="submit" className="btn btn-outline mt-4" disabled={busy || uncertain || loading || loadFailed}>Save shipping details</button>
          </form>
        </details>
        <form onSubmit={adjust}>
          <fieldset disabled={busy || uncertain || loadFailed} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] disabled:opacity-60">
            <legend className="sr-only">{inventory ? 'Adjust stock' : 'Start quantity tracking'}</legend>
            {inventory && <div>
              <label htmlFor="inventory-action" className="mb-2 block text-sm font-medium text-ink">Stock change</label>
              <select id="inventory-action" value={action} onChange={event => setAction(event.target.value as 'add' | 'remove')} className={inputClass}>
                <option value="add">Add stock</option>
                <option value="remove">Remove stock</option>
              </select>
            </div>}
            <div>
              <label htmlFor="inventory-quantity" className="mb-2 block text-sm font-medium text-ink">{inventory ? 'Quantity to ' + action : 'Starting quantity'}</label>
              <input id="inventory-quantity" type="number" inputMode="numeric" min={inventory ? 1 : 0} max={1_000_000} step="1" required value={quantity} onChange={event => setQuantity(event.target.value)} className={inputClass} aria-describedby="inventory-quantity-hint" />
              <p id="inventory-quantity-hint" className="mt-2 text-xs text-ink-muted">{inventory && action === 'remove' ? `Up to ${available} available. Reserved stock cannot be removed.` : 'Use whole sellable units for this SKU.'}</p>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="inventory-reason" className="mb-2 block text-sm font-medium text-ink">Reason</label>
              <input id="inventory-reason" required minLength={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} placeholder={inventory ? 'For example: shipment received, damaged item, return received' : 'For example: opening physical count'} className={inputClass} />
            </div>
          </fieldset>
          {uncertain && <p className="mt-4 text-sm text-ink-muted">The last change could not be confirmed. Retry below to check that same change safely; it will not be counted twice.</p>}
          <button type="submit" className="btn btn-solid mt-5" disabled={busy || loading || loadFailed}>{busy ? 'Saving…' : uncertain ? 'Retry stock change' : inventory ? action === 'add' ? 'Add stock' : 'Remove stock' : 'Start tracking stock'}</button>
        </form>
        {inventory && <div className="mt-6 border-t border-rule pt-5 text-xs leading-relaxed text-ink-muted">
          <p>Checkout reserves stock while payment is pending. Paid orders deduct it automatically, once. Pending reservations stay held until payment completes or the order is cancelled.</p>
          <p className="mt-2">Refunds do not automatically return items to stock. Add returned items after receiving and checking them. Low stock is {inventory.low_stock_threshold} or fewer on hand.</p>
        </div>}
        {data.movements.length > 0 && <div className="mt-6 border-t border-rule pt-5">
          <h3 className="mb-3 text-sm font-medium text-ink">Recent stock changes</h3>
          <ul className="divide-y divide-rule">
            {data.movements.map(movement => <li key={movement.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-ink">{actionLabels[movement.action] || movement.action.replace(/_/g, ' ')} · {movement.quantity}</p>
                <time dateTime={movement.created_at} className="text-xs text-ink-muted">{new Date(movement.created_at).toLocaleString()}</time>
              </div>
              <p className="mt-1 break-words text-ink-muted">{movement.reason}</p>
              <p className="mt-1 text-xs text-ink-muted">{movement.on_hand_after} on hand · {movement.reserved_after} reserved</p>
            </li>)}
          </ul>
        </div>}
      </>}
    </section>
  );
}

function Count({ label, count }: { label: string; count: number }) {
  return <div className="min-w-0"><dt className="text-xs text-ink-muted">{label}</dt><dd className="mt-1 break-all font-display text-2xl tabular-nums text-ink sm:text-3xl">{count.toLocaleString()}</dd></div>;
}
