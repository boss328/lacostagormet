import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Customer-side Supabase server client. Used by:
 *   - server components (/account/* pages, etc.)
 *   - route handlers (/auth/callback, /auth/sign-out)
 *
 * Uses the canonical @supabase/ssr v0.5+ getAll/setAll cookie pattern.
 * Cookie writes are wrapped in try/catch because Server Components
 * cannot mutate cookies — that's fine here, the middleware refreshes
 * sessions on every request, so any write attempt from a Server
 * Component context that would otherwise throw is safely no-op'd.
 *
 * Route handlers (where we DO need set() to land) call this same
 * factory but in a context where cookies().set is permitted, so
 * /auth/callback's exchangeCodeForSession persists cookies correctly.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component context — set is forbidden here. Middleware
            // owns session refresh, so swallowing is correct.
          }
        },
      },
    },
  );
}
