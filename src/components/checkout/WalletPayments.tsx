'use client';

import { createElement, useEffect, useRef, useState } from 'react';
import type { CheckoutCreatePayload } from '@/lib/checkout/validate';
import type { WalletMethod } from '@/lib/wallets/config';

type Config = { paypal: boolean; applePay: boolean; amazonPay: boolean; paypalClientId?: string;
  amazonMerchantId?: string; amazonPublicKeyId?: string; sandbox: boolean };
type Prepared = { attemptId: string; providerOrderId: string; orderNumber: string; total: string;
  status?: string; amazonConfig?: Record<string, string> };
type AppleConfig = { isEligible: boolean; countryCode: string; merchantCapabilities: string[]; supportedNetworks: string[] };
type AppleSession = {
  begin(): void; abort(): void; completeMerchantValidation(value: unknown): void; completePayment(value: number): void;
  onvalidatemerchant: (event: { validationURL: string }) => void;
  onpaymentauthorized: (event: { payment: { token: unknown; billingContact: unknown } }) => void;
  oncancel: () => void;
};
type AppleApi = { config(): Promise<AppleConfig>; validateMerchant(input: unknown): Promise<{ merchantSession: unknown }>;
  confirmOrder(input: unknown): Promise<unknown> };
type WalletWindow = Window & {
  paypal?: { FUNDING: { PAYPAL: string }; Buttons(options: Record<string, unknown>): { render(target: HTMLElement): Promise<void>; close(): Promise<void> }; Applepay(): AppleApi };
  ApplePaySession?: { new(version: number, request: unknown): AppleSession; canMakePayments(): boolean; STATUS_SUCCESS: number; STATUS_FAILURE: number };
  amazon?: { Pay: { renderButton(target: HTMLElement, options: Record<string, unknown>): unknown } };
};
const scripts = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  const prior = scripts.get(src); if (prior) return prior;
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script'); script.src = src; script.async = true;
    script.onload = () => resolve(); script.onerror = () => { scripts.delete(src); script.remove(); reject(new Error('Payment service could not load.')); };
    document.head.appendChild(script);
  });
  scripts.set(src, promise); return promise;
}
async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Payment service is unavailable.');
  return data as T;
}

export function WalletPayments({ payload, disabled, onActiveChange }: {
  payload: CheckoutCreatePayload; disabled: boolean; onActiveChange(active: boolean): void;
}) {
  const [config, setConfig] = useState<Config | null>(null);
  const [method, setMethod] = useState<WalletMethod | null>(null);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [approved, setApproved] = useState(false);
  const [appleEligible, setAppleEligible] = useState(false);
  const [apple, setApple] = useState<{ api: AppleApi; config: AppleConfig } | null>(null);
  const target = useRef<HTMLDivElement>(null);
  const requestIds = useRef(new Map<string, string>());

  useEffect(() => {
    let current = true;
    fetch('/api/checkout/wallet/config/', { cache: 'no-store' }).then(r => r.json()).then(c => { if (current) setConfig(c); }).catch(() => {});
    return () => { current = false; };
  }, []);

  useEffect(() => {
    if (!config?.applePay) return;
    let active = true;
    void (async () => {
      await loadScript('https://applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js');
      const w = window as WalletWindow;
      if (!w.ApplePaySession?.canMakePayments()) return;
      await loadScript(`https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(config.paypalClientId!)}&currency=USD&intent=capture&components=buttons,applepay`);
      const eligibility = await w.paypal!.Applepay().config();
      if (active) setAppleEligible(eligibility.isEligible);
    })().catch(() => {});
    return () => { active = false; };
  }, [config]);

  async function choose(selected: WalletMethod) {
    if (disabled || busy) return;
    setBusy(true); setError(''); setMethod(selected); onActiveChange(true);
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ selected, payload })));
      const key = `lcg-wallet-${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')}`;
      let requestId = requestIds.current.get(key);
      try { requestId = requestId ?? sessionStorage.getItem(key) ?? undefined; } catch {}
      if (!requestId) requestId = crypto.randomUUID();
      requestIds.current.set(key, requestId);
      try { sessionStorage.setItem(key, requestId); } catch {}
      const p = await post<Prepared>('/api/checkout/wallet/create/', { ...payload, method: selected, requestId });
      if (p.status === 'paid') { location.assign(`/order/${encodeURIComponent(p.orderNumber)}/`); return; }
      setPrepared(p);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to begin payment.'); }
    finally { setBusy(false); }
  }

  async function confirm(p: Prepared): Promise<boolean> {
    setApproved(true); setBusy(true); setError('');
    try {
      const result = await post<{ status: string; orderNumber: string }>('/api/checkout/wallet/confirm/', { attemptId: p.attemptId });
      if (result.status !== 'paid') {
        setError('Your payment is being confirmed. Do not pay again. Check the payment status below or contact us.');
        return false;
      }
      return true;
    } catch {
      setError('We could not yet confirm your payment. Do not pay again. Check the payment status below or contact us.');
      return false;
    } finally { setBusy(false); }
  }

  useEffect(() => {
    if (!prepared || !config || !method || !target.current) return;
    let active = true;
    let cleanup: (() => void) | undefined;
    const element = target.current;
    element.replaceChildren();
    setApple(null);
    async function render() {
      const w = window as WalletWindow;
      if (method === 'amazon_pay') {
        await loadScript('https://static-na.payments-amazon.com/checkout.js');
        if (!active) return;
        w.amazon!.Pay.renderButton(element, { merchantId: config!.amazonMerchantId, publicKeyId: config!.amazonPublicKeyId,
          ledgerCurrency: 'USD', sandbox: config!.sandbox, checkoutLanguage: 'en_US', productType: 'PayOnly',
          placement: 'Checkout', buttonColor: 'Gold', createCheckoutSessionConfig: prepared!.amazonConfig });
      } else {
        const components = config!.applePay ? 'buttons,applepay' : 'buttons';
        await loadScript(`https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(config!.paypalClientId!)}&currency=USD&intent=capture&components=${components}`);
        if (!active) return;
        if (method === 'paypal') {
          const buttons = w.paypal!.Buttons({ fundingSource: w.paypal!.FUNDING.PAYPAL,
            createOrder: () => prepared!.providerOrderId,
            onApprove: async () => { if (await confirm(prepared!)) location.assign(`/order/${encodeURIComponent(prepared!.orderNumber)}/`); },
            onCancel: () => setError('Payment cancelled. You have not completed this payment.'),
            onError: () => setError('PayPal could not complete checkout. If you approved payment, check its status before trying again.'),
          });
          await buttons.render(element); cleanup = () => { void buttons.close(); };
        } else {
          await loadScript('https://applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js');
          if (!active) return;
          if (!w.ApplePaySession?.canMakePayments()) throw new Error('Apple Pay is not available on this device. Choose another payment method.');
          const api = w.paypal!.Applepay(); const appleConfig = await api.config();
          if (!appleConfig.isEligible) throw new Error('Apple Pay is not available. Choose another payment method.');
          if (active) setApple({ api, config: appleConfig });
        }
      }
    }
    void render().catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load payment method.'); });
    return () => { active = false; cleanup?.(); element.replaceChildren(); };
    // The prepared server order is immutable; provider callbacks use that exact snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepared, config, method]);

  function payWithApple() {
    if (!apple || !prepared || busy || approved) return;
    const Session = (window as WalletWindow).ApplePaySession!;
    // Must be synchronous inside the user's click, with the server's exact amount.
    const session = new Session(4, { countryCode: apple.config.countryCode,
      merchantCapabilities: apple.config.merchantCapabilities, supportedNetworks: apple.config.supportedNetworks,
      currencyCode: 'USD', requiredBillingContactFields: ['postalAddress'],
      total: { label: 'La Costa Gourmet', type: 'final', amount: prepared.total } });
    session.onvalidatemerchant = event => {
      void apple.api.validateMerchant({ validationUrl: event.validationURL, displayName: 'La Costa Gourmet' })
        .then(r => session.completeMerchantValidation(r.merchantSession))
        .catch(() => { session.abort(); setError('Unable to validate Apple Pay. Choose another payment method.'); setBusy(false); });
    };
    session.onpaymentauthorized = event => {
      setApproved(true);
      void apple.api.confirmOrder({ orderId: prepared.providerOrderId, token: event.payment.token, billingContact: event.payment.billingContact })
        .then(async () => {
          const paid = await confirm(prepared);
          session.completePayment(paid ? Session.STATUS_SUCCESS : Session.STATUS_FAILURE);
          if (paid) location.assign(`/order/${encodeURIComponent(prepared.orderNumber)}/`);
        }).catch(() => { session.completePayment(Session.STATUS_FAILURE); setBusy(false);
          setError('Apple Pay could not be confirmed. Check the payment status before trying again.'); });
    };
    session.oncancel = () => setBusy(false);
    setBusy(true); session.begin();
  }

  if (!config || !(config.paypal || config.applePay || config.amazonPay)) return null;
  return <div className="mt-5 border-t border-rule pt-5">
    <p className="type-label-sm mb-3">Or pay with a wallet</p>
    {!method ? <div className="flex flex-wrap gap-3">
      {([['paypal', 'PayPal', config.paypal], ['apple_pay', 'Apple Pay', appleEligible], ['amazon_pay', 'Amazon Pay', config.amazonPay]] as const)
        .filter(([, , enabled]) => enabled).map(([value, label]) => <button key={value} type="button" disabled={disabled || busy}
          className="btn btn-outline disabled:opacity-50" onClick={() => void choose(value)}>{label}</button>)}
      {disabled && <p className="type-data-mono text-ink-muted">Complete your contact and shipping details to continue.</p>}
    </div> : <div>
      {prepared && <p className="type-body mb-3">Your total is ${prepared.total}. Complete payment below.</p>}
      <div ref={target} hidden={approved} style={{ maxWidth: 340, minHeight: prepared ? 45 : 0 }} />
      {apple && !approved && createElement('apple-pay-button', { buttonstyle: 'black', type: 'buy', locale: 'en-US', onClick: payWithApple })}
      {busy && <p role="status">{prepared ? 'Confirming payment…' : 'Preparing secure checkout…'}</p>}
      {!busy && !approved && <button type="button" className="type-data-mono underline mt-3" onClick={() => {
        setMethod(null); setPrepared(null); setApple(null); setError(''); onActiveChange(false);
      }}>Choose another payment method</button>}
      {approved && prepared && !busy && <button type="button" className="btn btn-outline mt-3" onClick={async () => {
        if (await confirm(prepared)) location.assign(`/order/${encodeURIComponent(prepared.orderNumber)}/`);
      }}>Check payment status</button>}
    </div>}
    {error && <p role="alert" className="type-body text-accent mt-3">{error}</p>}
  </div>;
}
