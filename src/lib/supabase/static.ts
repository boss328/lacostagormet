import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Build-time / cookie-less anon client.
 * Use only in `generateStaticParams` / `generateMetadata` contexts where the
 * request scope isn't available and therefore `cookies()` can't be called.
 *
 * Uses the anon key so RLS policies still apply — the service-role key is
 * reserved for `admin.ts`.
 *
 * `noStore` pins every underlying fetch to `cache: 'no-store'`. Cookie-less
 * clients are otherwise eligible for Vercel's Data Cache, which re-serves
 * stale rows indefinitely — even under `force-dynamic` (same failure as the
 * admin client, fixed in 3232e56). Request-time callers (sitemap) must pass
 * it; build-time callers (generateStaticParams / generateMetadata) keep the
 * default so their reads stay cacheable.
 */
export function createStaticClient(opts?: { noStore?: boolean }) {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      ...(opts?.noStore
        ? {
            global: {
              fetch: (url: RequestInfo | URL, options?: RequestInit) =>
                fetch(url, { ...options, cache: "no-store" }),
            },
          }
        : {}),
    },
  );
}
