import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type LocalShipment = {
  id: string;
  order_id: string;
  external_id: string;
  status: string;
  parcel: Record<string, number>;
  destination: Record<string, unknown>;
  rates: Array<{
    rateId: string;
    carrier: string;
    service: string;
    amount: number;
    currency: string;
  }>;
  carrier: string | null;
  service: string | null;
  postage: number | null;
  tracking_number: string | null;
  tracking_url: string | null;
  provider_shipment_id: string | null;
  label_id: string | null;
  label_download_url: string | null;
  label_format: string;
  created_at: string;
  shipped_at: string | null;
  last_error: string | null;
  notification_state: string;
  local_shipment_items: Array<{ order_item_id: string; quantity: number }>;
};
export async function shippingOrder(orderNumber: string) {
  const db = createAdminClient();
  const { data, error } = await db
    .from("orders")
    .select(
      "id,order_number,status,fulfillment_status,shipping_address,customer_email",
    )
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (error) throw new Error("Unable to load the order.");
  if (!data) throw new Error("Order not found.");
  return data;
}
export async function shippingMutation(
  orderId: string,
  action: string,
  payload: Record<string, unknown>,
) {
  const { data, error } = await createAdminClient().rpc("shipping_mutate", {
    p_order_id: orderId,
    p_action: action,
    p_payload: payload,
  });
  if (error)
    throw new Error(
      error.code === "P0001"
        ? error.message
        : "Could not save this shipment. Please reload and check its status.",
    );
  return data as LocalShipment & { claimed?: boolean };
}
export async function findShipment(orderId: string, shipmentId: string) {
  const { data, error } = await createAdminClient()
    .from("local_shipments")
    .select("*,local_shipment_items(order_item_id,quantity)")
    .eq("id", shipmentId)
    .eq("order_id", orderId)
    .maybeSingle();
  if (error || !data) throw new Error("Shipment not found.");
  return data as LocalShipment;
}
/** Call only after the page has verified customer ownership of this order. */
export async function getCustomerShipments(orderId: string) {
  const { data, error } = await createAdminClient()
    .from("local_shipments")
    .select("id,carrier,tracking_number,tracking_url,shipped_at")
    .eq("order_id", orderId)
    .eq("status", "shipped")
    .order("created_at");
  if (error) return [];
  return data.map((s) => ({
    id: s.id,
    carrier: s.carrier,
    trackingNumber: s.tracking_number,
    trackingUrl: s.tracking_url,
    shippedAt: s.shipped_at,
  }));
}
