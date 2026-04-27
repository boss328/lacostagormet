import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoginPageInner } from '@/app/login/LoginPageInner';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to La Costa Gourmet.',
  robots: { index: false, follow: false },
};

// LoginPageInner is a client component that reads useSearchParams.
// Next 14 requires that be wrapped in Suspense; otherwise static
// prerender bails out of the whole route. The fallback renders a
// skeletal version of the card so the reader doesn't see a blank gap.
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="max-w-content mx-auto px-8 py-24 max-sm:px-5 max-sm:py-16">
          <div
            className="bg-cream max-w-[440px] mx-auto"
            style={{ border: '1px solid var(--rule-strong)', padding: '40px 36px' }}
          >
            <p className="type-label text-accent text-center mb-3">§ Your account</p>
            <p className="type-data-mono text-ink-muted text-center">Loading…</p>
          </div>
        </main>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}
