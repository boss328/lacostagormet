import { createAdminClient } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/shop/PageHeader';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Unsubscribe',
  description: 'Stop cart-recovery reminders from La Costa Gourmet.',
};

type UnsubscribePageProps = {
  searchParams: { token?: string };
};

type Outcome =
  | { state: 'missing_token' }
  | { state: 'not_found' }
  | { state: 'already' }
  | { state: 'success'; email: string }
  | { state: 'error'; detail: string };

async function processUnsubscribe(token: string | undefined): Promise<Outcome> {
  if (!token || !/^[a-f0-9]{16,}$/i.test(token)) {
    return { state: 'missing_token' };
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from('abandoned_carts')
    .select('id, email, unsubscribed_at')
    .eq('unsubscribe_token', token)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') {
      return { state: 'error', detail: 'unsubscribe table not configured yet' };
    }
    console.error('[unsubscribe] lookup failed', error);
    return { state: 'error', detail: 'lookup failed' };
  }

  if (!data) return { state: 'not_found' };

  if (data.unsubscribed_at) {
    return { state: 'already' };
  }

  const { error: updateErr } = await admin
    .from('abandoned_carts')
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('id', data.id);

  if (updateErr) {
    console.error('[unsubscribe] update failed', updateErr);
    return { state: 'error', detail: 'update failed' };
  }

  // Also unsubscribe any *other* active rows for this email so a single
  // click stops every pending reminder, not just the one this token is
  // attached to. This is the user's clear intent.
  await admin
    .from('abandoned_carts')
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('email', (data.email as string).toLowerCase())
    .is('unsubscribed_at', null);

  return { state: 'success', email: data.email as string };
}

export default async function UnsubscribePage({ searchParams }: UnsubscribePageProps) {
  const outcome = await processUnsubscribe(searchParams.token);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: '/', label: 'Home' },
          { label: 'Unsubscribe' },
        ]}
        eyebrow="§ Email preferences"
        title={
          <>
            <em className="type-accent">Unsubscribe</em>.
          </>
        }
        lede="Manage La Costa Gourmet cart-recovery reminders."
      />

      <section className="max-w-content mx-auto px-8 py-14 max-md:px-4 max-md:py-8">
        <div
          className="bg-cream max-w-[560px]"
          style={{ border: '1px solid var(--rule-strong)', padding: '32px 36px' }}
        >
          <Outcome outcome={outcome} />
        </div>
      </section>
    </>
  );
}

function Outcome({ outcome }: { outcome: Outcome }) {
  if (outcome.state === 'success') {
    return (
      <>
        <p className="type-label text-accent mb-5">§ Confirmed</p>
        <p
          className="font-display italic text-brand-deep mb-4"
          style={{ fontSize: '24px', lineHeight: 1.15, letterSpacing: '-0.02em', fontWeight: 500 }}
        >
          You&rsquo;re unsubscribed.
        </p>
        <p className="type-body text-ink-2">
          We won&rsquo;t send any more cart-recovery reminders to{' '}
          <strong className="text-ink">{outcome.email}</strong>. Order confirmations
          and shipping updates for any future purchases will still go through —
          those aren&rsquo;t marketing emails.
        </p>
      </>
    );
  }
  if (outcome.state === 'already') {
    return (
      <>
        <p className="type-label text-accent mb-5">§ Already done</p>
        <p
          className="font-display italic text-brand-deep mb-4"
          style={{ fontSize: '24px', lineHeight: 1.15, letterSpacing: '-0.02em', fontWeight: 500 }}
        >
          You&rsquo;re already unsubscribed.
        </p>
        <p className="type-body text-ink-2">
          No further reminders will go out. If you start a fresh cart, we won&rsquo;t
          send recovery emails for it.
        </p>
      </>
    );
  }
  if (outcome.state === 'not_found') {
    return (
      <>
        <p className="type-label text-accent mb-5">§ Token not recognised</p>
        <p className="type-body text-ink-2">
          That unsubscribe link doesn&rsquo;t match any record we have. If you
          keep receiving emails you don&rsquo;t want, reply to one of them and
          we&rsquo;ll handle it manually.
        </p>
      </>
    );
  }
  if (outcome.state === 'missing_token') {
    return (
      <>
        <p className="type-label text-accent mb-5">§ Missing token</p>
        <p className="type-body text-ink-2">
          This page needs an unsubscribe token from the link in your email. If
          you arrived here by accident, you can close the tab.
        </p>
      </>
    );
  }
  return (
    <>
      <p className="type-label text-accent mb-5">§ Something went wrong</p>
      <p className="type-body text-ink-2">
        We couldn&rsquo;t process the unsubscribe request right now ({outcome.detail}).
        Reply to any La Costa Gourmet email and we&rsquo;ll take you off the list.
      </p>
    </>
  );
}
