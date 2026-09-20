import 'server-only';
import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkoutCreateSchema } from '@/lib/checkout/validate';
import { computeShipping, loadShippingSettings, round2 } from '@/lib/checkout/pricing';
import { z } from 'zod';
import { walletConfig } from './config';
import type { WalletAttempt } from './verification';

export const walletRequestSchema = checkoutCreateSchema.extend({
  requestId: z.string().uuid(), method: z.enum(['paypal', 'apple_pay', 'amazon_pay']),
}).refine(p => new Set(p.items.map(i => i.product_id)).size === p.items.length, 'Duplicate products');

export async function prepareWalletAttempt(body: unknown, clientIp: string, owner: string): Promise<WalletAttempt> {
  if (!/^[0-9a-f]{64}$/.test(owner)) throw new Error('Reload checkout to begin');
  const p = walletRequestSchema.parse(body);
  const config = walletConfig();
  if (!config[p.method]) throw new Error('This payment method is not available');
  const admin = createAdminClient();
  const { data, error } = await admin.from('products')
    .select('id,sku,name,retail_price,wholesale_cost,preferred_vendor_id,is_active').in('id', p.items.map(i => i.product_id));
  if (error || !data) throw new Error('Unable to check product prices');
  const lines = p.items.map(item => {
    const product = data.find(product => product.id === item.product_id && product.is_active);
    if (!product) throw new Error('An item is no longer available');
    const price = Number(product.retail_price);
    if (!Number.isFinite(price) || price < 0) throw new Error('Invalid product price');
    return { product_id: item.product_id, product_sku: product.sku, product_name: product.name,
      quantity: item.quantity, unit_price: round2(price), line_subtotal: round2(price * item.quantity),
      unit_wholesale_cost: product.wholesale_cost, assigned_vendor_id: product.preferred_vendor_id };
  });
  const subtotal = round2(lines.reduce((sum, l) => sum + l.line_subtotal, 0));
  const shipping = computeShipping(subtotal, p.shippingAddress.state, await loadShippingSettings());
  const total = round2(subtotal + shipping);
  if (!Number.isFinite(total) || total <= 0) throw new Error('Invalid order total');
  const a = p.shippingAddress;
  const address = { first_name: a.firstName, last_name: a.lastName, company: a.company,
    address1: a.address1, address2: a.address2, city: a.city, state: a.state, zip: a.zip, country: 'US', phone: a.phone };
  // The fingerprint excludes browser prices. Retries cannot change the saved order/address/method.
  const fingerprint = createHash('sha256').update(JSON.stringify({ owner, email: p.email, address,
    items: p.items.slice().sort((a, b) => a.product_id.localeCompare(b.product_id)), method: p.method })).digest('hex');
  const { data: attempt, error: rpcError } = await admin.rpc('prepare_wallet_checkout', {
    p_id: p.requestId, p_fingerprint: fingerprint, p_method: p.method, p_environment: config.environment,
    p_order: { customer_email: p.email, subtotal, shipping_cost: shipping, tax: 0, total,
      shipping_address: address, billing_address: address, business_name: a.company || null,
      is_business: !!a.company, client_ip: clientIp }, p_items: lines,
  });
  if (rpcError || !attempt) throw new Error('Unable to prepare checkout. Please keep this checkout open and try again.');
  return attempt as WalletAttempt;
}
