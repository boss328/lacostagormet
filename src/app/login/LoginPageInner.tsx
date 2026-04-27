'use client';

import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import logo from '../../../public/logo.png';

/**
 * Client-side login form. Magic link only, no passwords.
 *
 * - Reads ?redirect=<path> so the post-sign-in landing can come from
 *   the middleware's "you must sign in" redirect.
 * - Reads ?error=... to surface callback failures (missing_code,
 *   exchange).
 * - Builds emailRedirectTo from NEXT_PUBLIC_SITE_URL when set
 *   (production), falls back to runtime origin (local dev). This is
 *   what makes magic links from a Vercel preview deploy still resolve
 *   against the production callback path that Supabase has allowlisted.
 *
 * Wrapped in <Suspense> by /login/page.tsx because useSearchParams
 * forces dynamic rendering and Next 14 will bail out of static
 * prerender otherwise.
 */
export function LoginPageInner() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const redirect = searchParams.get('redirect') || '/account';

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('sending');
    setErrorMsg('');

    try {
      const supabase = createClient();
      const envOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
      const runtimeOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      const origin = envOrigin || runtimeOrigin;

      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: `${origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
        },
      });

      if (signInError) {
        setStatus('error');
        setErrorMsg(signInError.message);
      } else {
        setStatus('sent');
      }
    } catch (err) {
      console.error('[login] signInWithOtp threw', err);
      setStatus('error');
      setErrorMsg('Something went wrong. Try again in a moment.');
    }
  }

  const errorBanner =
    error === 'missing_code'
      ? 'Sign-in link is missing its verification code. Request a new one.'
      : error === 'exchange'
        ? 'Sign-in link expired or was already used. Request a new one.'
        : null;

  return (
    <main className="max-w-content mx-auto px-8 py-24 max-sm:px-5 max-sm:py-16">
      <div
        className="bg-cream max-w-[440px] mx-auto"
        style={{ border: '1px solid var(--rule-strong)', padding: '40px 36px' }}
      >
        <div className="flex justify-center mb-8">
          <Image
            src={logo}
            alt="La Costa Gourmet"
            sizes="220px"
            placeholder="blur"
            className="w-[180px] h-auto"
          />
        </div>

        <p className="type-label text-accent mb-3 text-center">§ Your account</p>
        <h1
          className="font-display text-ink text-center mb-3"
          style={{ fontSize: '32px', lineHeight: 1.05, letterSpacing: '-0.02em', fontWeight: 400 }}
        >
          Sign <em className="type-accent">in</em>.
        </h1>
        <p
          className="type-data-mono text-ink-muted text-center mb-7"
          style={{ lineHeight: 1.5 }}
        >
          We&rsquo;ll email you a one-click link. No passwords.
        </p>

        {errorBanner && (
          <p
            className="type-data-mono text-accent text-center mb-5"
            role="alert"
            style={{ padding: '10px 12px', background: 'rgba(193, 72, 40, 0.08)' }}
          >
            {errorBanner}
          </p>
        )}

        {status === 'sent' ? (
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
              Link valid for 15 minutes. If it doesn&rsquo;t arrive, check spam
              or request another.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="type-label-sm text-ink">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="bg-paper text-ink font-display"
                style={{
                  border: '1px solid var(--rule-strong)',
                  padding: '14px 16px',
                  fontSize: '16px',
                  lineHeight: 1.3,
                }}
              />
            </div>

            <button
              type="submit"
              disabled={status === 'sending'}
              className={`btn btn-solid w-full justify-center ${status === 'sending' ? 'opacity-60 cursor-wait' : ''}`}
              style={{ padding: '16px 26px' }}
            >
              <span>{status === 'sending' ? 'Sending…' : 'Send sign-in link'}</span>
              {status !== 'sending' && (
                <span className="btn-arrow" aria-hidden="true">
                  →
                </span>
              )}
            </button>

            {status === 'error' && (
              <p className="type-data-mono text-accent" role="alert">
                {errorMsg || 'Could not send the link. Try again in a moment.'}
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
