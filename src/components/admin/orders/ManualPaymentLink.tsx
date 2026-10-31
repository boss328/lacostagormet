'use client';
import { useState } from 'react';

export function ManualPaymentLink({ orderNumber, total }: { orderNumber: string; total: string }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function createLink() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}/payment-link/`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok || !result.path) throw new Error(result.error || 'Could not create a payment link.');
      setUrl(new URL(result.path, window.location.origin).href);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create a payment link.');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage('Payment link copied.');
    } catch {
      setMessage('Select and copy the link below.');
    }
  }

  return <section className="bg-cream border border-rule p-5 mt-6" aria-label="Customer payment link">
    <h2 className="font-display text-xl text-ink">Customer payment link</h2>
    <p className="text-sm text-ink-2 my-3">Collect {total} for this order. The link includes the prices and shipping you saved and is valid for seven days.</p>
    {url ? <>
      <label className="block text-sm text-ink">Private link for this customer
        <input className="block w-full my-2 p-2 border border-rule" readOnly value={url} onFocus={event => event.target.select()} />
      </label>
      <div className="flex flex-wrap gap-4 items-center">
        <button type="button" className="btn btn-solid" onClick={copy}>Copy payment link</button>
        <a href={url} target="_blank" rel="noopener noreferrer" className="underline">Open checkout</a>
      </div>
    </> : <button type="button" className="btn btn-solid" disabled={busy} onClick={createLink}>{busy ? 'Preparing link…' : 'Get customer payment link'}</button>}
    <p role="status" className="text-sm mt-2">{message}</p>
  </section>;
}
