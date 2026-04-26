import Image from 'next/image';
import logo from '../../../../public/logo.png';

export const metadata = {
  title: 'Admin Access',
  robots: { index: false, follow: false },
};

/**
 * Admin password gate. Single shared password (ADMIN_PASSWORD env var)
 * gates the entire /admin surface. The form posts directly to
 * /api/admin/login/ — note the trailing slash to match
 * trailingSlash:true in next.config.mjs and skip the 308 hop on
 * Vercel that previously dropped POST bodies.
 *
 * Errors:
 *   ?error=wrong  — bad password
 *   ?error=config — server is missing ADMIN_PASSWORD env var
 */
export default function AdminLoginPage({
  searchParams,
}: {
  searchParams: { redirect?: string; error?: string };
}) {
  const redirect = searchParams.redirect || '/admin/';
  const error = searchParams.error;

  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-5 py-12">
      <div
        className="bg-cream w-full max-w-[440px]"
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

        <p className="type-label text-accent mb-3 text-center">§ Admin Access</p>
        <h1
          className="font-display text-ink text-center mb-3"
          style={{ fontSize: '32px', lineHeight: 1.05, letterSpacing: '-0.02em', fontWeight: 400 }}
        >
          Enter the password
          <br />
          to <em className="type-accent">continue</em>.
        </h1>

        {error === 'config' && (
          <p
            className="type-data-mono text-accent text-center mt-4 mb-2"
            role="alert"
            style={{ padding: '10px 12px', background: 'rgba(193, 72, 40, 0.08)' }}
          >
            Server misconfigured — contact site admin.
          </p>
        )}
        {error === 'wrong' && (
          <p
            className="type-data-mono text-accent text-center mt-4 mb-2"
            role="alert"
            style={{ padding: '10px 12px', background: 'rgba(193, 72, 40, 0.08)' }}
          >
            Incorrect password.
          </p>
        )}

        <form
          method="post"
          action="/api/admin/login/"
          className="flex flex-col gap-5 mt-7"
        >
          <input type="hidden" name="redirect" value={redirect} />
          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="type-label-sm text-ink">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoFocus
              autoComplete="current-password"
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
            className="btn btn-solid w-full justify-center"
            style={{ padding: '16px 26px' }}
          >
            <span>Sign in</span>
            <span className="btn-arrow" aria-hidden="true">→</span>
          </button>
        </form>
      </div>
    </main>
  );
}
