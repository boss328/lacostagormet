'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type LoginFormProps = {
  redirectTo: string;
};

export function LoginForm({ redirectTo }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'submitting' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState('submitting');
    setErrorMessage(null);
    try {
      const supabase = createClient();
      // Prefer the env-pinned production origin so the magic link
      // always points at the real site, even when the customer requests
      // it from a Vercel preview deploy. Falls back to runtime origin
      // for local dev. Trailing slash on /auth/callback/ skips the
      // 308 hop that trailingSlash:true would otherwise force.
      const envOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
      const runtimeOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      const origin = envOrigin || runtimeOrigin;
      const callback = `${origin}/auth/callback/?redirect=${encodeURIComponent(redirectTo)}`;
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: callback },
      });
      if (error) throw error;
      setState('sent');
    } catch (err) {
      console.error('[login] magic link request failed', err);
      setState('error');
      setErrorMessage('We could not send a link to that address. Try again in a moment.');
    }
  }

  return (
    <div
      className="bg-cream"
      style={{ border: '1px solid var(--rule-strong)', padding: '44px 40px' }}
    >
      <p className="type-label text-accent mb-6">§ The cellar key</p>
      <h1 className="type-display-2 mb-6">
        Sign <em className="type-accent">in</em>.
      </h1>
      <p
        className="type-body pl-5 mb-10"
        style={{
          backgroundImage:
            'linear-gradient(to bottom, var(--color-gold) 0%, transparent 100%)',
          backgroundSize: '1px 100%',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'left top',
          fontSize: '15.5px',
          lineHeight: 1.55,
        }}
      >
        We&apos;ll email you a one-click link. No passwords — the old ones from the
        BigCommerce site don&apos;t carry over.
      </p>

      {state === 'sent' ? (
        <div
          className="bg-paper-2"
          style={{ border: '1px solid var(--rule)', padding: '24px 26px' }}
          role="status"
        >
          <p
            className="font-display italic text-brand-deep mb-2"
            style={{ fontSize: '22px', letterSpacing: '-0.02em', fontWeight: 500 }}
          >
            Check your inbox.
          </p>
          <p className="type-data-mono text-ink-muted">
            Link valid for 15 minutes. If it doesn&apos;t arrive, check spam or request another.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
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
              placeholder="you@yourplace.com"
              className="bg-cream text-ink font-display"
              style={{
                border: '1px solid var(--rule-strong)',
                padding: '14px 16px',
                fontSize: '16px',
                lineHeight: 1.3,
              }}
            />
          </div>

          {errorMessage && (
            <p className="type-data-mono text-accent" role="alert">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={state === 'submitting' || !email.includes('@')}
            className={`btn btn-solid w-full justify-center ${state === 'submitting' || !email.includes('@') ? 'opacity-60 cursor-not-allowed' : ''}`}
            style={{ padding: '16px 26px' }}
          >
            <span>{state === 'submitting' ? 'Sending…' : 'Send me a link'}</span>
            <span className="btn-arrow" aria-hidden="true">→</span>
          </button>
        </form>
      )}
    </div>
  );
}
