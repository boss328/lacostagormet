import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { walletConfig } from '@/lib/wallets/config';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  // Files are the unmodified PayPal domain-association downloads for each environment.
  const file = walletConfig().environment === 'live'
    ? join(process.cwd(), 'public/payments/apple-domain-live.txt')
    : join(process.cwd(), 'public/payments/apple-domain-sandbox.txt');
  return new Response(await readFile(file), { headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
}
