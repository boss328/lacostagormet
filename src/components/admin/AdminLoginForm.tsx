type AdminLoginFormProps = {
  redirectTo: string;
  error: string | null;
};

export function AdminLoginForm({ redirectTo, error }: AdminLoginFormProps) {
  return (
    <div
      className="bg-cream"
      style={{ border: '1px solid var(--rule-strong)', padding: '40px 36px' }}
    >
      <p className="type-label text-accent mb-5">§ Admin access</p>
      <h1 className="type-display-2 mb-4">
        Staff <em className="type-accent">only</em>.
      </h1>
      <p className="type-data-mono text-ink-muted mb-8">
        Phase 6 gate — temporary password. Phase 7 swaps in role-based auth.
      </p>

      {/* Action carries the trailing slash directly — with trailingSlash:true
          in next.config.mjs, posting to /api/admin/login (no slash) would
          force Vercel's edge to issue a 308. POST→308→re-POST chains are
          fragile on edge networks; writing the slash inline skips the dance. */}
      <form method="post" action="/api/admin/login/" className="flex flex-col gap-5">
        <input type="hidden" name="redirect" value={redirectTo} />
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
            className="bg-cream text-ink font-display"
            style={{
              border: '1px solid var(--rule-strong)',
              padding: '14px 16px',
              fontSize: '16px',
              lineHeight: 1.3,
            }}
          />
        </div>

        {error === 'wrong' && (
          <p className="type-data-mono text-accent" role="alert">
            Wrong password.
          </p>
        )}

        <label
          htmlFor="remember"
          className="flex items-center gap-3 cursor-pointer select-none"
        >
          <input
            id="remember"
            name="remember"
            type="checkbox"
            value="true"
            defaultChecked
            className="accent-brand-deep"
            style={{ width: 16, height: 16 }}
          />
          <span
            className="font-display text-ink-2"
            style={{ fontSize: '14px', lineHeight: 1.3 }}
          >
            Remember this device
            <span className="type-data-mono text-ink-muted ml-2">
              § 90 days
            </span>
          </span>
        </label>

        <button
          type="submit"
          className="btn btn-solid w-full justify-center"
          style={{ padding: '16px 26px' }}
        >
          <span>Enter</span>
          <span className="btn-arrow" aria-hidden="true">→</span>
        </button>
      </form>
    </div>
  );
}
