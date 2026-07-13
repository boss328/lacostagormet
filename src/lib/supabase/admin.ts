import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS. Server-only.
 * Never import from a client component or a route that streams to the browser.
 *
 * fetch is pinned to cache:'no-store': on Vercel, Next's Data Cache was
 * caching this client's GET requests indefinitely (and the cache persists
 * across deployments), so admin pages rendered stale rows — e.g. a product's
 * saved UPC read back as null on the edit page even though the write
 * persisted. The storefront's @supabase/ssr client is exempt because its
 * cookies() usage opts those renders out of caching; this client has no
 * cookies in scope, so it must opt out explicitly. Do not remove.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        fetch: (url: RequestInfo | URL, options?: RequestInit) =>
          fetch(url, { ...options, cache: 'no-store' }),
      },
    },
  );
}
