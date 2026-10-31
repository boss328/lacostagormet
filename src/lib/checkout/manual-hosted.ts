import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getHostedPaymentToken } from '@/lib/authnet/hosted';
import { hostedPaymentUrl, resolveAuthnetEnv } from '@/lib/authnet/environment';
import { createAdminClient } from '@/lib/supabase/admin';

const savedAddress = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  address1: z.string().min(1),
  address2: z.string().nullish(),
  city: z.string().min(1),
  state: z.string().min(1),
  zip: z.string().min(1),
  country: z.string().nullish(),
  company: z.string().nullish(),
  phone: z.string().nullish(),
}).transform(address => ({
  firstName: address.first_name,
  lastName: address.last_name,
  address1: address.address1,
  address2: address.address2 ?? undefined,
  city: address.city,
  state: address.state,
  zip: address.zip,
  country: address.country ?? 'US',
  company: address.company ?? undefined,
  phone: address.phone ?? undefined,
}));

const claimedOrder = z.object({
  state: z.literal('claimed'),
  orderNumber: z.string().min(1),
  total: z.number().positive(),
  customerEmail: z.string().email(),
  billingAddress: savedAddress,
  shippingAddress: savedAddress,
});

type ManualPaymentResult =
  | { success: true; hostedUrl: string; formToken: string }
  | { success: false; status: number; errorMessage: string };

export async function startManualHostedPayment(
  grant: { orderId: string; amountCents: number }, origin: string,
): Promise<ManualPaymentResult> {
  const admin = createAdminClient();
  const environment = resolveAuthnetEnv(process.env.AUTHNET_ENVIRONMENT);
  const claimId = randomUUID();
  const { data, error } = await admin.rpc('claim_manual_hosted_payment', {
    p_order_id: grant.orderId,
    p_amount_cents: grant.amountCents,
    p_environment: environment,
    p_claim_id: claimId,
  });
  if (error) throw new Error('Manual payment lookup failed.');
  if (data?.state === 'busy') {
    return { success: false, status: 409, errorMessage: 'Your payment page is being prepared. Please try again in a minute.' };
  }
  if (data?.state === 'review') {
    return { success: false, status: 409, errorMessage: 'The payment session has expired. Contact La Costa Gourmet so we can check whether payment was received.' };
  }
  if (data?.state === 'ready' && typeof data.formToken === 'string' && data.formToken) {
    return { success: true, hostedUrl: hostedPaymentUrl(environment), formToken: data.formToken };
  }
  const order = claimedOrder.safeParse(data);
  if (!order.success || Math.round(order.data.total * 100) !== grant.amountCents) {
    return { success: false, status: 409, errorMessage: 'This order is unavailable for payment. Contact La Costa Gourmet for help.' };
  }
  const { orderNumber, total, customerEmail, billingAddress, shippingAddress } = order.data;
  const provider = await getHostedPaymentToken({
    orderNumber, amount: total, customerEmail, billingAddress, shippingAddress,
    returnUrl: new URL('/api/checkout/hosted-callback/?orderNumber=' + encodeURIComponent(orderNumber), origin).href,
    cancelUrl: new URL('/pay/', origin).href,
  });
  if (!provider.ok) {
    return { success: false, status: 502, errorMessage: 'The payment provider could not open a payment page. Please try again in a minute.' };
  }
  const saved = await admin.rpc('publish_manual_hosted_payment', {
    p_order_id: grant.orderId, p_claim_id: claimId, p_form_token: provider.formToken,
  });
  if (saved.error || saved.data !== true) {
    return { success: false, status: 409, errorMessage: 'The order changed while opening payment. Refresh the payment link to check its status.' };
  }
  return { success: true, hostedUrl: hostedPaymentUrl(environment), formToken: provider.formToken };
}
