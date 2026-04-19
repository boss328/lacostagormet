import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to La Costa Gourmet.',
  robots: { index: false, follow: false },
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const redirect = typeof searchParams.redirect === 'string' ? searchParams.redirect : '/account';
  return (
    <section className="max-w-content mx-auto px-8 py-24 max-sm:px-5 max-sm:py-16">
      <div className="max-w-[520px] mx-auto">
        <LoginForm redirectTo={redirect} />
      </div>
    </section>
  );
}
