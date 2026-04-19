import { z } from 'zod';

/**
 * Request schema for POST /api/checkout/submit.
 *
 * Client sends cart items (product_id + quantity only) — the server
 * re-fetches prices from Supabase. clientSubtotal is sent for drift
 * detection, never for the actual charge amount.
 */

export const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
] as const;

export const addressSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName:  z.string().min(1).max(80),
  address1:  z.string().min(1).max(200),
  address2:  z.string().max(200).optional().default(''),
  city:      z.string().min(1).max(80),
  state:     z.enum(US_STATES),
  zip:       z.string().regex(/^\d{5}(-\d{4})?$/, 'ZIP must be 5 or 9 digits'),
  phone:     z.string().min(7).max(30),
});

export const cartItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity:   z.number().int().positive().max(999),
});

export const opaqueSchema = z.object({
  dataDescriptor: z.string().min(1),
  dataValue:      z.string().min(1),
});

export const checkoutSubmitSchema = z.object({
  email: z.string().email().max(254),
  shippingAddress: addressSchema,
  items: z.array(cartItemSchema).min(1).max(100),
  clientSubtotal: z.number().nonnegative(),
  opaqueData: opaqueSchema,
});

export type CheckoutSubmitPayload = z.infer<typeof checkoutSubmitSchema>;
export type AddressPayload = z.infer<typeof addressSchema>;
