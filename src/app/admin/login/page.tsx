import { AdminLoginForm } from '@/components/admin/AdminLoginForm';

export const metadata = {
  title: 'Admin · Sign in',
  robots: { index: false, follow: false },
};

export default function AdminLoginPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const redirect = typeof searchParams.redirect === 'string' ? searchParams.redirect : '/admin';
  const error = typeof searchParams.error === 'string' ? searchParams.error : null;
  return (
    <section className="max-w-content mx-auto px-8 py-24 max-sm:px-5 max-sm:py-16">
      <div className="max-w-[440px] mx-auto">
        <AdminLoginForm redirectTo={redirect} error={error} />
      </div>
    </section>
  );
}
