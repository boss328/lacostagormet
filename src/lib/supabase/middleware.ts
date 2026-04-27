import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Canonical @supabase/ssr v0.5+ middleware session refresher.
 *
 * Three things happen here, in order:
 *   1. Build a `response = NextResponse.next({ request: req })` — passing
 *      the request forward is what lets server components downstream
 *      read cookies that this middleware is about to refresh.
 *   2. Construct a Supabase server client whose setAll callback
 *      (a) mutates req.cookies so subsequent reads in this same request
 *          (server components calling cookies()) see the refreshed pair,
 *      (b) rebuilds the response with the mutated request, and
 *      (c) writes Set-Cookie on the response so the browser stores the
 *          new pair on the way out.
 *   3. await supabase.auth.getUser() — this is the call that actually
 *      refreshes the access token if it has expired and triggers setAll.
 *      Without it, cookies go stale between page navigations and the
 *      user looks logged out on the next click.
 *
 * Returns both the updated response and the resolved user so the
 * caller (the actual middleware) can apply route-specific gates.
 */
export async function updateSession(req: NextRequest) {
  let response = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            req.cookies.set(name, value);
          }
          response = NextResponse.next({ request: req });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
