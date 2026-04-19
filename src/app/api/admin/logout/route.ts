import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function logout(req: NextRequest) {
  const url = new URL(req.url);
  const res = NextResponse.redirect(new URL('/admin/login', url.origin), 303);
  res.cookies.set({
    name: 'lcg_admin',
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
