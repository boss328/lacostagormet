import { createBrowserClient } from "@supabase/ssr";

/**
 * Customer-side Supabase client. Uses @supabase/ssr's
 * createBrowserClient so the PKCE verifier is stored in cookies the
 * server callback can read — `@supabase/supabase-js` would default
 * to localStorage and `exchangeCodeForSession` would fail with
 * "PKCE code verifier not found in storage" after the magic-link
 * redirect.
 *
 * `flowType: 'pkce'` is the @supabase/ssr default, but we pin it
 * explicitly so a future package upgrade can't silently flip the
 * implicit/PKCE switch on us.
 *
 * Called per-component (not a singleton) — keeps hot-reload from
 * holding stale references across edits.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { flowType: "pkce" },
    },
  );
}
