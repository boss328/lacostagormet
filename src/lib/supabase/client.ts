import { createBrowserClient } from '@supabase/ssr';

/**
 * Customer-side Supabase browser client. The single thing this module
 * does is hand back a fresh client per call — no singleton, no flow-type
 * override, no fancy options. @supabase/ssr defaults to PKCE and
 * cookie-based storage, which is exactly what the canonical Next.js 14
 * pattern wants.
 *
 * Used by client components (e.g. /login page) for signInWithOtp and
 * any other browser-side Supabase calls. Never imported on the server.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
