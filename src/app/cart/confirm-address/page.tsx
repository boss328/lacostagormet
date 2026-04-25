'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCartStore, selectItemCount } from '@/stores/cart';
import { US_STATES, type AddressPayload } from '@/lib/checkout/validate';

const EMPTY: AddressPayload = {
  firstName: '',
  lastName:  '',
  address1:  '',
  address2:  '',
  city:      '',
  state:     'CA',
  zip:       '',
  phone:     '',
};

/**
 * /cart/confirm-address — the reorder confirmation step.
 *
 * Reads the prefill address that was attached to the cart store when
 * Reorder was clicked. User reviews / edits, then continues to the
 * existing checkout. We persist the edited address back into the
 * store's prefillAddress field so the CheckoutForm picks it up via
 * `consumePrefillAddress()` on mount.
 */
export default function ConfirmAddressPage() {
  const router = useRouter();
  const itemCount = useCartStore(selectItemCount);
  const reorder = useCartStore((s) => s.reorder);
  const setPrefillAddress = useCartStore((s) => s.setPrefillAddress);
  const dismissUnavailable = useCartStore((s) => s.dismissUnavailableNotice);

  const [hydrated, setHydrated] = useState(false);
  const [address, setAddress] = useState<AddressPayload>(EMPTY);

  // Hydrate after mount so SSR/Zustand persist don't fight.
  useEffect(() => {
    setHydrated(true);
    if (reorder.prefillAddress) {
      setAddress(reorder.prefillAddress);
    }
    // Intentionally seeding once on mount; subsequent edits live in
    // local state and are written back on submit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const valid = useMemo(() => {
    return (
      address.firstName.trim().length > 0 &&
      address.lastName.trim().length > 0 &&
      address.address1.trim().length > 0 &&
      address.city.trim().length > 0 &&
      /^\d{5}(-\d{4})?$/.test(address.zip.trim()) &&
      address.phone.trim().length >= 7
    );
  }, [address]);

  function update<K extends keyof AddressPayload>(k: K, v: AddressPayload[K]) {
    setAddress((prev) => ({ ...prev, [k]: v }));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valid) return;
    setPrefillAddress(address);
    router.push('/checkout');
  }

  // If user lands here with an empty cart (e.g. direct URL hit), nudge
  // them home rather than render an orphan form.
  if (hydrated && itemCount === 0) {
    return (
      <section className="max-w-content mx-auto px-8 py-20 max-md:px-4 max-md:py-12">
        <div
          className="bg-cream max-w-[560px] mx-auto text-center"
          style={{ border: '1px solid var(--rule-strong)', padding: '40px 32px' }}
        >
          <p className="type-label text-accent mb-4">§ Cart is empty</p>
          <p
            className="font-display italic text-brand-deep mb-5"
            style={{ fontSize: '24px', lineHeight: 1.1, fontWeight: 500 }}
          >
            Nothing to confirm.
          </p>
          <Link href="/account/orders/" className="btn btn-solid" style={{ padding: '13px 22px' }}>
            <span>Browse past orders</span>
            <span className="btn-arrow" aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="max-w-content mx-auto px-8 pt-12 pb-20 max-md:px-4 max-md:pt-6 max-md:pb-10">
      <header className="mb-8 max-md:mb-6">
        <p className="type-label text-accent mb-3">
          § Reorder
          {reorder.sourceOrderNumber ? (
            <>
              {' · '}
              <span className="text-ink-muted">from {reorder.sourceOrderNumber}</span>
            </>
          ) : null}
        </p>
        <h1 className="type-display-2 mb-3">
          Confirm <em className="type-accent">shipping address</em>.
        </h1>
        <p className="type-body max-w-[620px]">
          We&rsquo;ve pre-filled this from your previous order. Make any changes
          before continuing to payment.
        </p>
      </header>

      {reorder.unavailableNotice && reorder.unavailableNotice.length > 0 && (
        <div
          role="status"
          className="bg-paper-2 mb-8 flex items-start justify-between gap-4 max-md:flex-col"
          style={{ border: '1px solid var(--rule)', padding: '14px 18px' }}
        >
          <p className="type-data-mono text-ink-2">
            <span className="text-accent">Heads up:</span>{' '}
            {reorder.unavailableNotice.length} item
            {reorder.unavailableNotice.length === 1 ? '' : 's'} from the
            original order couldn&rsquo;t be added — no longer carried or out
            of stock.
          </p>
          <button
            type="button"
            onClick={dismissUnavailable}
            className="type-label-sm text-ink-muted hover:text-accent shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className="grid gap-10 lg:grid-cols-[1fr_320px] max-lg:gap-6"
      >
        <div
          className="bg-cream"
          style={{ border: '1px solid var(--rule-strong)', padding: '28px' }}
        >
          <p className="type-label text-ink mb-5">§ Ship to</p>
          <div className="grid gap-5 max-md:gap-3">
            <div className="grid gap-5 max-md:gap-3 sm:grid-cols-2">
              <Field
                label="First name"
                name="firstName"
                value={address.firstName}
                onChange={(v) => update('firstName', v)}
                required
                autoComplete="given-name"
              />
              <Field
                label="Last name"
                name="lastName"
                value={address.lastName}
                onChange={(v) => update('lastName', v)}
                required
                autoComplete="family-name"
              />
            </div>
            <Field
              label="Street address"
              name="address1"
              value={address.address1}
              onChange={(v) => update('address1', v)}
              required
              autoComplete="address-line1"
            />
            <Field
              label="Apt / suite (optional)"
              name="address2"
              value={address.address2 ?? ''}
              onChange={(v) => update('address2', v)}
              autoComplete="address-line2"
            />
            <div className="grid gap-5 max-md:gap-3 sm:grid-cols-[1.4fr_auto_auto]">
              <Field
                label="City"
                name="city"
                value={address.city}
                onChange={(v) => update('city', v)}
                required
                autoComplete="address-level2"
              />
              <div className="flex flex-col gap-2">
                <label htmlFor="state" className="type-label-sm text-ink">
                  State <span className="text-accent" aria-hidden="true">*</span>
                </label>
                <select
                  id="state"
                  name="state"
                  value={address.state}
                  onChange={(e) => update('state', e.target.value as AddressPayload['state'])}
                  className="bg-paper text-ink font-display"
                  style={{ border: '1px solid var(--rule-strong)', padding: '11px 12px', fontSize: '14px' }}
                >
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <Field
                label="ZIP"
                name="zip"
                value={address.zip}
                onChange={(v) => update('zip', v)}
                required
                autoComplete="postal-code"
              />
            </div>
            <Field
              label="Phone"
              name="phone"
              type="tel"
              value={address.phone}
              onChange={(v) => update('phone', v)}
              required
              autoComplete="tel"
            />
          </div>
        </div>

        <aside className="flex flex-col gap-3">
          <div
            className="bg-paper-2"
            style={{ border: '1px solid var(--rule)', padding: '20px 22px' }}
          >
            <p className="type-label text-ink mb-3">§ Cart</p>
            <p className="type-data-mono text-ink-2">
              {itemCount} item{itemCount === 1 ? '' : 's'} ready for checkout.
            </p>
            <Link
              href="/cart/"
              className="type-label-sm text-ink-muted hover:text-brand-deep mt-3 inline-block"
            >
              Edit cart →
            </Link>
          </div>

          <button
            type="submit"
            disabled={!valid}
            className={`btn btn-solid w-full justify-center ${!valid ? 'opacity-60 cursor-not-allowed' : ''}`}
            style={{ padding: '16px 22px' }}
          >
            <span>Continue to payment</span>
            <span className="btn-arrow" aria-hidden="true">→</span>
          </button>
          {!valid && (
            <p className="type-data-mono text-ink-muted">
              Fill in name, address, city, ZIP, and phone to continue.
            </p>
          )}
        </aside>
      </form>
    </section>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  required,
  type = 'text',
  autoComplete,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="type-label-sm text-ink">
        {label}
        {required && <span className="text-accent ml-1" aria-hidden="true">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-paper text-ink font-display"
        style={{
          border: '1px solid var(--rule-strong)',
          padding: '11px 14px',
          fontSize: '14px',
          lineHeight: 1.4,
        }}
      />
    </div>
  );
}
