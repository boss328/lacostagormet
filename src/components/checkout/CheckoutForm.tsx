'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import {
  useCartStore,
  selectSubtotal,
  selectItemCount,
  FREE_SHIPPING_THRESHOLD,
  type CartItem,
} from '@/stores/cart';
import { US_STATES, type AddressPayload } from '@/lib/checkout/validate';
import { formatPackSize } from '@/lib/pack-size';

const CREAM_BG =
  'radial-gradient(ellipse at center, var(--color-cream) 0%, var(--color-paper-2) 115%)';

const SHIPPING_STANDARD = 12.99;
const HI_AK_SURCHARGE = 25;

function splitPrice(n: number): { dollars: string; cents: string } {
  const [d, c = '00'] = n.toFixed(2).split('.');
  return { dollars: d, cents: c.padEnd(2, '0').slice(0, 2) };
}

function Price({ amount, size = 22 }: { amount: number; size?: number }) {
  const { dollars, cents } = splitPrice(amount);
  return (
    <span className="type-price" style={{ fontSize: `${size}px`, lineHeight: 1 }}>
      ${dollars}
      <sup
        className="font-display"
        style={{
          fontSize: `${Math.round(size * 0.48)}px`,
          color: 'var(--color-ink-muted)',
          marginLeft: '2px',
          verticalAlign: 'super',
        }}
      >
        {cents}
      </sup>
    </span>
  );
}

function clientShipping(subtotal: number, state: string): number {
  const s = state.trim().toUpperCase();
  if (s === 'HI' || s === 'AK') return SHIPPING_STANDARD + HI_AK_SURCHARGE;
  if (subtotal >= FREE_SHIPPING_THRESHOLD) return 0;
  return SHIPPING_STANDARD;
}

const EMPTY_ADDRESS: AddressPayload = {
  firstName: '',
  lastName: '',
  address1: '',
  address2: '',
  city: '',
  state: 'CA',
  zip: '',
  phone: '',
};

const ERROR_MESSAGES: Record<string, string> = {
  declined: 'Your payment was declined. Try a different card or contact your bank.',
  'callback-missing-order': 'We lost track of your order on the return trip — please retry.',
  'callback-order-missing': 'That order could not be found. Please retry.',
  'callback-no-transid': 'Payment provider returned without a transaction id. Please retry.',
  'callback-lookup-failed': 'We could not verify your payment. Please retry.',
  'callback-refid-mismatch': 'Security check failed — payment was not applied. Please retry.',
  'callback-amount-mismatch': 'Amount mismatch on the return trip. Please retry.',
};

/**
 * Redirects the browser to Auth.net's hosted payment page by building a
 * form element, appending it to the document, and submitting. Must POST
 * (not GET) because the token is a form field, not a query param.
 */
function submitToHostedPage(hostedUrl: string, formToken: string): void {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = hostedUrl;
  form.style.display = 'none';

  const tokenInput = document.createElement('input');
  tokenInput.type = 'hidden';
  tokenInput.name = 'token';
  tokenInput.value = formToken;
  form.appendChild(tokenInput);

  document.body.appendChild(form);
  form.submit();
}

export function CheckoutForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore(selectSubtotal);
  const itemCount = useCartStore(selectItemCount);

  const [hydrated, setHydrated] = useState(false);
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState<AddressPayload>(EMPTY_ADDRESS);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Surface any error from the hosted-callback redirect.
  useEffect(() => {
    const err = searchParams.get('error');
    if (err && ERROR_MESSAGES[err]) setErrorMessage(ERROR_MESSAGES[err]);
  }, [searchParams]);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const shipping = useMemo(
    () => clientShipping(subtotal, address.state),
    [subtotal, address.state],
  );
  const total = subtotal + shipping;

  const shippingValid =
    address.firstName.trim() &&
    address.lastName.trim() &&
    address.address1.trim() &&
    address.city.trim() &&
    /^\d{5}(-\d{4})?$/.test(address.zip.trim()) &&
    address.phone.trim().length >= 7 &&
    (US_STATES as readonly string[]).includes(address.state);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canContinue = Boolean(emailValid && shippingValid) && !submitting;

  const updateAddress = <K extends keyof AddressPayload>(
    key: K,
    value: AddressPayload[K],
  ) => {
    setAddress((a) => ({ ...a, [key]: value }));
  };

  useEffect(() => {
    if (hydrated && items.length === 0 && !submitting) {
      router.replace('/shop');
    }
  }, [hydrated, items.length, submitting, router]);

  async function handleContinue() {
    if (!canContinue) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const body = {
        email,
        shippingAddress: address,
        items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
        clientSubtotal: subtotal,
      };
      const res = await fetch('/api/checkout/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const responseBody = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        orderNumber?: string;
        formToken?: string;
        hostedUrl?: string;
        errorMessage?: string;
      };

      if (
        !res.ok ||
        !responseBody.success ||
        !responseBody.formToken ||
        !responseBody.hostedUrl
      ) {
        setErrorMessage(
          responseBody.errorMessage ?? 'Something went wrong. Please try again.',
        );
        setSubmitting(false);
        return;
      }

      // Keep submitting=true — we're about to leave this page. Redirect
      // browser to Auth.net's hosted payment page via form POST.
      submitToHostedPage(responseBody.hostedUrl, responseBody.formToken);
    } catch (e) {
      console.error('[checkout] create failed', e);
      setErrorMessage('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  if (!hydrated) {
    return (
      <section className="max-w-content mx-auto px-8 py-20 max-sm:px-5 max-sm:py-14">
        <p className="type-data-mono text-ink-muted">Loading checkout…</p>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="max-w-content mx-auto px-8 py-20 max-sm:px-5 max-sm:py-14">
        <p className="type-data-mono text-ink-muted">Your cart is empty — redirecting…</p>
      </section>
    );
  }

  return (
    <>
      {/* Slim back-to-cart bar */}
      <div className="bg-paper border-b border-rule">
        <div className="max-w-content mx-auto px-8 py-3 max-sm:px-5">
          <Link
            href="/cart"
            className="type-data-mono text-ink-muted hover:text-brand-deep transition-colors duration-200 inline-flex items-center gap-1.5"
          >
            <ChevronLeft size={12} strokeWidth={1.75} aria-hidden="true" />
            Back to cart
          </Link>
        </div>
      </div>

      {/* Header */}
      <header className="bg-cream border-b border-rule">
        <div className="max-w-content mx-auto px-8 pt-12 pb-10 max-sm:px-5 max-sm:pt-9 max-sm:pb-8">
          <p className="type-label text-accent mb-5">§ The checkout</p>
          <h1 className="type-display-2 mb-3">
            Almost <em className="type-accent">there</em>.
          </h1>
          <p className="type-data-mono text-ink-muted">
            {itemCount} {itemCount === 1 ? 'item' : 'items'} · secure checkout
          </p>
        </div>
      </header>

      <section className="max-w-content mx-auto px-8 py-14 max-sm:px-5 max-sm:py-10">
        <div className="grid gap-14 max-lg:gap-10 lg:grid-cols-[1.5fr_0.7fr]">
          {/* Left — form */}
          <div className="flex flex-col gap-8">
            {errorMessage && (
              <div
                role="alert"
                className="bg-cream"
                style={{ border: '1px solid var(--color-accent)', padding: '16px 18px' }}
              >
                <p className="type-label-sm text-accent mb-1">Payment issue</p>
                <p className="type-body" style={{ fontSize: '15px', lineHeight: 1.5 }}>
                  {errorMessage}
                </p>
              </div>
            )}

            <FormSection roman="I" label="Contact">
              <div className="flex flex-col gap-2">
                <label htmlFor="email" className="type-label-sm text-ink">
                  Email <span className="text-accent" aria-hidden="true">*</span>
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-cream text-ink font-display"
                  style={inputStyle}
                />
              </div>
            </FormSection>

            <FormSection roman="II" label="Shipping address">
              <div className="grid gap-5 max-sm:gap-4">
                <div className="grid gap-5 max-sm:gap-4 sm:grid-cols-2">
                  <TextField
                    id="firstName"
                    label="First name"
                    required
                    autoComplete="given-name"
                    value={address.firstName}
                    onChange={(v) => updateAddress('firstName', v)}
                  />
                  <TextField
                    id="lastName"
                    label="Last name"
                    required
                    autoComplete="family-name"
                    value={address.lastName}
                    onChange={(v) => updateAddress('lastName', v)}
                  />
                </div>
                <TextField
                  id="address1"
                  label="Address"
                  required
                  autoComplete="address-line1"
                  value={address.address1}
                  onChange={(v) => updateAddress('address1', v)}
                />
                <TextField
                  id="address2"
                  label="Apt / suite (optional)"
                  autoComplete="address-line2"
                  value={address.address2 ?? ''}
                  onChange={(v) => updateAddress('address2', v)}
                />
                <div className="grid gap-5 max-sm:gap-4 sm:grid-cols-[1.3fr_0.7fr_1fr]">
                  <TextField
                    id="city"
                    label="City"
                    required
                    autoComplete="address-level2"
                    value={address.city}
                    onChange={(v) => updateAddress('city', v)}
                  />
                  <div className="flex flex-col gap-2">
                    <label htmlFor="state" className="type-label-sm text-ink">
                      State <span className="text-accent" aria-hidden="true">*</span>
                    </label>
                    <select
                      id="state"
                      name="state"
                      required
                      autoComplete="address-level1"
                      value={address.state}
                      onChange={(e) =>
                        updateAddress('state', e.target.value as AddressPayload['state'])
                      }
                      className="bg-cream text-ink font-display"
                      style={inputStyle}
                    >
                      {US_STATES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <TextField
                    id="zip"
                    label="ZIP"
                    required
                    autoComplete="postal-code"
                    value={address.zip}
                    onChange={(v) => updateAddress('zip', v)}
                  />
                </div>
                <TextField
                  id="phone"
                  label="Phone"
                  required
                  autoComplete="tel"
                  type="tel"
                  value={address.phone}
                  onChange={(v) => updateAddress('phone', v)}
                />
              </div>
            </FormSection>

            <FormSection roman="III" label="Payment">
              <p
                className="font-display text-ink-2 mb-3"
                style={{ fontSize: '15px', lineHeight: 1.55 }}
              >
                You&rsquo;ll enter your card on Authorize.net&rsquo;s secure page on the next
                step. Card details never reach our server.
              </p>
              <p className="type-data-mono text-ink-muted">
                Supports browser autofill · SSL throughout · 3D Secure when your bank requires it
              </p>
            </FormSection>
          </div>

          {/* Right — sticky summary */}
          <aside className="lg:sticky lg:top-6 self-start">
            <div
              className="bg-cream"
              style={{ border: '1px solid var(--rule-strong)', padding: '28px' }}
            >
              <p className="type-label text-ink mb-6">§&nbsp;&nbsp;Order summary</p>

              <ul className="flex flex-col" style={{ borderTop: '1px solid var(--rule)' }}>
                {items.map((item) => (
                  <SummaryLine key={item.product_id} item={item} />
                ))}
              </ul>

              <dl
                className="flex flex-col mt-5"
                style={{ borderTop: '1px solid var(--rule-strong)' }}
              >
                <SummaryRow label="Subtotal" value={<Price amount={subtotal} size={17} />} />
                <SummaryRow
                  label="Shipping"
                  value={
                    shipping === 0 ? (
                      <span
                        className="font-display italic text-gold-bright"
                        style={{
                          fontSize: '15px',
                          letterSpacing: '-0.01em',
                          fontWeight: 500,
                        }}
                      >
                        FREE
                      </span>
                    ) : (
                      <Price amount={shipping} size={15} />
                    )
                  }
                  note={
                    shipping === 0
                      ? 'Orders over $70 · continental US'
                      : address.state === 'HI' || address.state === 'AK'
                        ? 'HI/AK surcharge applied'
                        : `Add ${(FREE_SHIPPING_THRESHOLD - subtotal).toFixed(2)} for free ground`
                  }
                />
              </dl>

              <div
                className="mt-5 pt-4 flex items-baseline justify-between"
                style={{ borderTop: '1px solid var(--rule-strong)' }}
              >
                <span className="type-label text-ink">Total</span>
                <Price amount={total} size={26} />
              </div>

              <div className="mt-6">
                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={!canContinue}
                  className={`btn btn-solid w-full justify-center ${!canContinue ? 'opacity-60 cursor-not-allowed' : ''}`}
                  style={{ padding: '18px 26px' }}
                  aria-busy={submitting}
                >
                  <span>
                    {submitting
                      ? 'Redirecting to payment…'
                      : `Continue to payment — $${total.toFixed(2)}`}
                  </span>
                  <span className="btn-arrow" aria-hidden="true">→</span>
                </button>
              </div>

              <p className="type-data-mono text-ink-muted mt-4 text-center">
                Next step: Authorize.net&rsquo;s secure card entry
              </p>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}

const inputStyle = {
  border: '1px solid var(--rule-strong)',
  padding: '12px 14px',
  fontSize: '15px',
  lineHeight: 1.4,
};

function FormSection({
  roman,
  label,
  children,
}: {
  roman: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="bg-cream"
      style={{ border: '1px solid var(--rule)', padding: '28px 32px', borderRadius: 0 }}
    >
      <div
        className="flex items-baseline gap-4 mb-6 pb-4"
        style={{ borderBottom: '1px dashed var(--rule)' }}
      >
        <span
          className="font-display italic text-brand-deep"
          style={{ fontSize: '28px', lineHeight: 1, letterSpacing: '-0.02em', fontWeight: 500 }}
        >
          {roman}
        </span>
        <span className="type-label text-ink-muted">{label}</span>
      </div>
      {children}
    </section>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  required = false,
  autoComplete,
  type = 'text',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  autoComplete?: string;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="type-label-sm text-ink">
        {label}
        {required && <span className="text-accent ml-1" aria-hidden="true">*</span>}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        required={required}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-cream text-ink font-display"
        style={inputStyle}
      />
    </div>
  );
}

function SummaryLine({ item }: { item: CartItem }) {
  const pack = formatPackSize(item.pack_size);
  const lineTotal = item.price * item.quantity;
  return (
    <li
      className="flex items-center gap-3 py-3"
      style={{ borderBottom: '1px solid var(--rule)' }}
    >
      <div
        className="relative overflow-hidden shrink-0"
        style={{
          width: 48,
          height: 48,
          background: CREAM_BG,
          border: '1px solid var(--rule)',
        }}
      >
        {item.image_url && (
          <div className="absolute inset-0" style={{ padding: 4 }}>
            <Image
              src={item.image_url}
              alt=""
              width={96}
              height={96}
              sizes="48px"
              className="w-full h-full object-contain img-product"
            />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className="font-display text-ink line-clamp-2"
          style={{ fontSize: '13px', lineHeight: 1.3 }}
        >
          {item.name}
        </p>
        <p className="type-data-mono text-ink-muted">
          {pack ? `${pack} · ` : ''}qty {item.quantity}
        </p>
      </div>
      <span className="type-data-mono text-ink shrink-0">${lineTotal.toFixed(2)}</span>
    </li>
  );
}

function SummaryRow({
  label,
  value,
  note,
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-6 py-3"
      style={{ borderBottom: '1px solid var(--rule)' }}
    >
      <div className="flex flex-col gap-1">
        <dt className="type-label-sm text-ink">{label}</dt>
        {note && <span className="type-data-mono text-ink-muted">{note}</span>}
      </div>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
