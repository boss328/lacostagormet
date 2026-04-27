import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /auth/sign-out — signs out the customer and redirects home.
 *
 * supabase.auth.signOut() clears the session cookies via the server
 * client's setAll callback, which writes Set-Cookie back through
 * cookies() in next/headers; Next attaches those to whatever
 * NextResponse this handler returns.
 *
 * Accepts both POST (form submission from the account layout) and GET
 * (legacy Link-based clicks) so existing callers keep working through
 * the rebuild.
 */
async function handleSignOut(req: NextRequest) {
  const supabase = createClient();
  await supabase.auth.signOut();
  const url = new URL(req.url);
  return NextResponse.redirect(new URL('/', url.origin), 303);
}

export async function POST(req: NextRequest) {
  return handleSignOut(req);
}
export async function GET(req: NextRequest) {
  return handleSignOut(req);
}
