import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Build-time / cookie-less anon client.
 * Use only in `generateStaticParams` / `generateMetadata` contexts where the
 * request scope isn't available and therefore `cookies()` can't be called.
 *
 * Uses the anon key so RLS policies still apply — the service-role key is
 * reserved for `admin.ts`.
 */
export function createStaticClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
