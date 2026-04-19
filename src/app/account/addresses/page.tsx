import { getSessionUser } from '@/lib/supabase/auth-helpers';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type AddressRow = {
  id: string;
  first_name: string;
  last_name: string;
  street1: string;
  street2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string | null;
  is_default_shipping: boolean;
  is_default_billing: boolean;
};

export default async function AccountAddressesPage() {
  const user = await getSessionUser();
  const email = user?.email ?? '';
  const admin = createAdminClient();

  const { data: customer } = await admin
    .from('customers')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  let addresses: AddressRow[] = [];
  if (customer?.id) {
    const { data } = await admin
      .from('addresses')
      .select('id, first_name, last_name, street1, street2, city, state, postal_code, country, phone, is_default_shipping, is_default_billing')
      .eq('customer_id', customer.id)
      .order('is_default_shipping', { ascending: false });
    addresses = (data ?? []) as AddressRow[];
  }

  return (
    <>
      <header className="mb-10">
        <p className="type-label text-accent mb-5">§ The address book</p>
        <h1 className="type-display-2">
          Saved <em className="type-accent">addresses</em>.
        </h1>
        <p className="type-data-mono text-ink-muted mt-4">
          {addresses.length} on file
        </p>
      </header>

      {addresses.length === 0 ? (
        <div
          className="bg-paper-2 text-center px-10 py-16 max-sm:px-5"
          style={{ border: '1px solid var(--rule)' }}
        >
          <p
            className="font-display italic text-brand-deep mb-2"
            style={{ fontSize: '22px', letterSpacing: '-0.02em' }}
          >
            No addresses yet.
          </p>
          <p className="type-data-mono text-ink-muted">
            Your next order&rsquo;s shipping address is saved here automatically.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 max-lg:grid-cols-1 lg:grid-cols-2">
          {addresses.map((a) => (
            <div
              key={a.id}
              className="bg-cream"
              style={{ border: '1px solid var(--rule-strong)', padding: '22px 24px' }}
            >
              {(a.is_default_shipping || a.is_default_billing) && (
                <p className="type-label-sm text-accent mb-3">
                  {a.is_default_shipping ? 'Default shipping' : null}
                  {a.is_default_shipping && a.is_default_billing ? ' · ' : null}
                  {a.is_default_billing ? 'Default billing' : null}
                </p>
              )}
              <address className="font-display text-ink not-italic" style={{ fontSize: '15px', lineHeight: 1.55 }}>
                {a.first_name} {a.last_name}
                <br />
                {a.street1}
                {a.street2 && (
                  <>
                    <br />
                    {a.street2}
                  </>
                )}
                <br />
                {a.city}, {a.state} {a.postal_code}
                {a.country && a.country !== 'US' && (
                  <>
                    <br />
                    {a.country}
                  </>
                )}
              </address>
              {a.phone && <p className="type-data-mono text-ink-muted mt-3">{a.phone}</p>}
            </div>
          ))}
        </div>
      )}

      <p className="type-data-mono text-ink-muted mt-10">
        Add / edit / delete arrives with the next update.
      </p>
    </>
  );
}
