import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE } from '@/lib/admin/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Clears the admin session cookie and redirects to /admin/login/.
 * Accepts both GET (top-rail link click) and POST (form submission).
 */
async function logout(req: NextRequest) {
  const url = new URL(req.url);
  const res = NextResponse.redirect(new URL('/admin/login/', url.origin), 303);
  res.cookies.set({
    name: ADMIN_COOKIE,
    value: '',
    maxAge: 0,
    path: '/',
  });
  return res;
}

export async function POST(req: NextRequest) {
  return logout(req);
}
export async function GET(req: NextRequest) {
  return logout(req);
}
