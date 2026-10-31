'use client';
import { useState } from 'react';
import { submitToHostedPage } from './submit-hosted-payment';

export function ManualPaymentButton({ reviewId, total }: { reviewId: string; total: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function start() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/checkout/manual-pay/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewId }),
      });
      const result = await response.json();
      if (!response.ok || !result.formToken || !result.hostedUrl)
        throw new Error(result.errorMessage || 'Payment is unavailable. Please contact La Costa with your order number.');
      submitToHostedPage(result.hostedUrl, result.formToken);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the payment page.');
      setBusy(false);
    }
  }
  return <div className="mt-6">
    <button type="button" className="btn btn-solid" disabled={busy} onClick={start}>
      {busy ? 'Opening secure payment…' : `Pay ${total} by card`}
    </button>
    <p className="mt-2 text-sm text-ink-muted">Enter your card details on the secure Authorize.net payment page.</p>
    {error && <p className="mt-3 text-sm text-accent" role="alert">{error}</p>}
  </div>;
}
