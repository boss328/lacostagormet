import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, expectedSessionToken } from "@/lib/admin/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { shippingConfiguration } from "@/lib/shipping/config";
import {
  findShipment,
  shippingMutation,
  shippingOrder,
  type LocalShipment,
} from "@/lib/shipping/repository";
import {
  normalizeAddress,
  safeTrackingUrl,
  ShipStation,
  validatePackage,
  type ProviderLabel,
} from "@/lib/shipping/shipstation";
import { downloadLabelPdf, formatLabelPdf } from "@/lib/shipping/label-pdf";
import { sendTransactionalEmail } from "@/lib/email/send";
import { renderLocalShipment } from "@/lib/email/templates/local-shipment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: { orderNumber: string } };
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
async function authenticated(req: NextRequest) {
  const expected = await expectedSessionToken();
  return Boolean(expected && req.cookies.get(ADMIN_COOKIE)?.value === expected);
}
const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Enforce the limit on bytes received, including requests without Content-Length. */
async function readBody(req: NextRequest): Promise<Record<string, unknown>> {
  const reader = req.body?.getReader();
  if (!reader) throw new Error("Send a shipping request as a JSON object.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 30_000) {
      await reader.cancel();
      throw new RangeError("Request too large.");
    }
    chunks.push(value);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch {
    throw new Error("Send a shipping request as a JSON object.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Send a shipping request as a JSON object.");
  return parsed as Record<string, unknown>;
}

export async function GET(req: NextRequest, { params }: Context) {
  if (!(await authenticated(req)))
    return json({ error: "Not authenticated." }, 401);
  try {
    const order = await shippingOrder(params.orderNumber);
    const db = createAdminClient();
    const config = shippingConfiguration();
    const labelId = req.nextUrl.searchParams.get("label");
    if (labelId) {
      if (!uuid(labelId)) return json({ error: "Invalid shipment." }, 400);
      const shipment = await findShipment(order.id, labelId);
      if (
        !shipment.label_id ||
        !["label_created", "shipped"].includes(shipment.status)
      )
        return json({ error: "No purchased label for this shipment." }, 404);
      // Refresh expired download URLs with a read-only label lookup, never a purchase.
      const provider = config.apiKey ? new ShipStation(config.apiKey) : null;
      let url = shipment.label_download_url;
      if (provider) {
        const label = await provider.getLabel(shipment.label_id);
        if (label.status === "voided" || label.voided === true)
          return json({ error: "This label was voided in ShipStation." }, 409);
        url = label.label_download?.pdf || label.label_download?.href || url;
      }
      if (!url)
        return json(
          { error: "Label download is unavailable. Check ShipStation." },
          409,
        );
      const bytes = await formatLabelPdf(
        await downloadLabelPdf(url),
        req.nextUrl.searchParams.get("format") === "letter" ? "letter" : "4x6",
      );
      return new NextResponse(Buffer.from(bytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="label-${shipment.id}.pdf"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    const [items, shipments, pos] = await Promise.all([
      db
        .from("order_items")
        .select("id,product_name,product_sku,quantity,assigned_vendor_id")
        .eq("order_id", order.id),
      db
        .from("local_shipments")
        .select("*,local_shipment_items(order_item_id,quantity)")
        .eq("order_id", order.id)
        .order("created_at", { ascending: false }),
      db
        .from("vendor_orders")
        .select("id,vendor_id,status")
        .eq("order_id", order.id)
        .neq("status", "cancelled"),
    ]);
    const schemaReady = !shipments.error && !items.error && !pos.error;
    const rows = (shipments.data || []) as LocalShipment[];
    const base = `/api/admin/orders/${encodeURIComponent(order.order_number)}/shipping/`;
    const canShip =
      order.status === "paid" &&
      !["shipped", "delivered"].includes(order.fulfillment_status);
    return json({
      enabled: config.enabled,
      ready: config.ready && schemaReady,
      notice: !schemaReady
        ? "Shipping storage needs its database update before activation."
        : !canShip
          ? "New shipments require a paid order with unshipped items."
          : config.notice,
      configuration: {
        canQuote: config.canQuote && schemaReady && canShip,
        canPurchase: config.canPurchase && schemaReady && canShip,
        canRecordManual: config.canRecordManual && schemaReady,
      },
      items: (items.data || []).map((i) => {
        const vendor = (pos.data || []).find(
          (p) => p.vendor_id === i.assigned_vendor_id,
        );
        const ambiguous = !i.assigned_vendor_id && !!pos.data?.length;
        const allocated = rows
          .filter((s) => s.status !== "cancelled")
          .flatMap((s) =>
            s.local_shipment_items.map((si) => ({ ...si, status: s.status })),
          )
          .filter((si) => si.order_item_id === i.id);
        const shipped =
          vendor && ["shipped", "delivered"].includes(vendor.status)
            ? i.quantity
            : allocated
                .filter((si) => si.status === "shipped")
                .reduce((n, si) => n + si.quantity, 0);
        const reserved = allocated
          .filter((si) => si.status !== "shipped")
          .reduce((n, si) => n + si.quantity, 0);
        return {
          orderItemId: i.id,
          name: i.product_name,
          sku: i.product_sku,
          orderedQuantity: i.quantity,
          shippedQuantity: shipped,
          reservedQuantity: reserved,
          availableQuantity:
            vendor || ambiguous || !canShip
              ? 0
              : Math.max(0, i.quantity - shipped - reserved),
          blockedReason: vendor
            ? "Assigned to a supplier PO"
            : ambiguous
              ? "Confirm this item’s vendor assignment before shipping locally."
              : null,
        };
      }),
      shipments: rows.map((s) => ({
        id: s.id,
        status: s.status,
        items: s.local_shipment_items.map((si) => ({
          orderItemId: si.order_item_id,
          name:
            items.data?.find((i) => i.id === si.order_item_id)?.product_name ||
            "Product",
          quantity: si.quantity,
        })),
        carrier: s.carrier,
        service: s.service,
        trackingNumber: s.tracking_number,
        trackingUrl: s.tracking_url,
        label4x6Url: s.label_id ? `${base}?label=${s.id}&format=4x6` : null,
        labelLetterUrl: s.label_id
          ? `${base}?label=${s.id}&format=letter`
          : null,
        postageCents:
          s.postage === null ? null : Math.round(Number(s.postage) * 100),
        createdAt: s.created_at,
        error: s.last_error,
        notificationState: s.notification_state,
      })),
    });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "Unable to load shipping.",
      },
      400,
    );
  }
}

async function saveLabel(
  orderId: string,
  shipment: LocalShipment,
  label: ProviderLabel,
) {
  if (label.status !== "completed" || label.voided === true || !label.tracking_number || !label.label_id)
    throw new Error(
      "The label is still processing. Use Recover status shortly.",
    );
  if (
    label.external_shipment_id &&
    label.external_shipment_id !== shipment.external_id
  )
    throw new Error("Label reference does not match this shipment.");
  return shippingMutation(orderId, "store_label", {
    shipmentId: shipment.id,
    label_id: label.label_id,
    provider_shipment_id: label.shipment_id,
    label_download_url: label.label_download?.pdf || label.label_download?.href,
    tracking_number: label.tracking_number,
    tracking_url: safeTrackingUrl(
      label.carrier_code || shipment.carrier || "",
      label.tracking_number,
    ),
  });
}
async function notifyShipment(
  order: Awaited<ReturnType<typeof shippingOrder>>,
  shipmentId: string,
) {
  const claimed = await shippingMutation(order.id, "claim_notification", {
    shipmentId,
  });
  if (!claimed.claimed)
    return {
      warning:
        claimed.notification_state === "sent"
          ? undefined
          : "Shipment saved. Notification is already pending or needs review.",
    };
  const shipment = await findShipment(order.id, shipmentId);
  const db = createAdminClient();
  const items = await db
    .from("order_items")
    .select("id,product_name")
    .eq("order_id", order.id)
    .order("id");
  if (items.error)
    throw new Error("Shipment saved. Retry its notification shortly.");
  const template = renderLocalShipment({
    orderNumber: order.order_number,
    tracking: shipment.tracking_number!,
    trackingUrl: shipment.tracking_url,
    carrier: shipment.carrier || "Carrier",
    items: [...shipment.local_shipment_items]
      .sort((a, b) => a.order_item_id.localeCompare(b.order_item_id))
      .map((si) => ({
        name:
          items.data.find((i) => i.id === si.order_item_id)?.product_name ||
          "Product",
        quantity: si.quantity,
      })),
  });
  const result = await sendTransactionalEmail({
    to: order.customer_email,
    subject: `Shipment update for La Costa Gourmet order #${order.order_number}`,
    html: template.html,
    text: template.text,
    idempotencyKey: `local-shipment/${shipmentId}`,
    tags: [{ name: "type", value: "order_shipped" }],
  });
  await shippingMutation(order.id, "finish_notification", {
    shipmentId,
    ok: result.ok,
  });
  return {
    warning: result.ok
      ? undefined
      : "Shipment saved; the notification could not be sent. Retry notification from shipment history.",
  };
}

export async function POST(req: NextRequest, { params }: Context) {
  if (!(await authenticated(req)))
    return json({ error: "Not authenticated." }, 401);
  if (req.headers.get("origin") !== req.nextUrl.origin)
    return json({ error: "Invalid request origin." }, 403);
  if (Number(req.headers.get("content-length") || 0) > 30_000)
    return json({ error: "Request too large." }, 413);
  const config = shippingConfiguration();
  if (!config.canRecordManual)
    return json(
      { error: "Shipment changes are disabled in this environment." },
      409,
    );
  try {
    const body = await readBody(req);
    const action = body.action;
    const order = await shippingOrder(params.orderNumber);
    const provider = config.apiKey ? new ShipStation(config.apiKey) : null;
    if (action === "rates" || action === "manual_tracking") {
      if (
        !Array.isArray(body.items) ||
        !body.items.length ||
        body.items.length > 200 ||
        body.items.some(
          (i) =>
            !i || typeof i !== "object" || !uuid(i.orderItemId) ||
            !Number.isSafeInteger(i.quantity) ||
            Number(i.quantity) <= 0,
        )
      )
        throw new Error("Select valid items and whole quantities.");
      if (action === "manual_tracking") {
        const carrier = typeof body.carrier === "string" ? body.carrier.trim() : "";
        const tracking = typeof body.trackingNumber === "string" ? body.trackingNumber.trim() : "";
        if (
          !carrier ||
          carrier.length > 80 ||
          !/^[a-zA-Z0-9 -]{3,100}$/.test(tracking)
        )
          throw new Error("Enter a valid carrier and tracking number.");
        const s = await shippingMutation(order.id, "manual", {
          items: body.items,
          tracking_number: tracking,
          carrier,
          tracking_url: safeTrackingUrl(carrier, tracking),
        });
        return json({
          shipmentId: s.id,
          ...(await notifyShipment(order, s.id)),
        });
      }
      if (!config.canQuote || !provider)
        throw new Error(
          "Configure ShipStation and the shipping addresses first.",
        );
      const parcel = validatePackage(body.package);
      const shipTo = normalizeAddress(order.shipping_address);
      const s = await shippingMutation(order.id, "reserve", {
        items: body.items,
        parcel,
      });
      try {
        const quote = await provider.rates({
          externalId: s.external_id,
          orderNumber: order.order_number,
          shipFrom: config.shipFrom!,
          returnTo: config.returnTo!,
          shipTo,
          parcel,
        });
        await shippingMutation(order.id, "save_rates", {
          shipmentId: s.id,
          ...quote,
        });
        return json({ shipmentId: s.id, rates: quote.rates });
      } catch (error) {
        await shippingMutation(order.id, "rate_failed", { shipmentId: s.id });
        throw error;
      }
    }
    if (!uuid(body.shipmentId)) throw new Error("Choose a valid shipment.");
    const shipment = await findShipment(order.id, body.shipmentId);
    if (action === "buy_label") {
      if (!config.canPurchase || !provider)
        throw new Error("Live label purchasing has not been enabled.");
      if (typeof body.rateId !== "string")
        throw new Error("Choose a shipping rate.");
      const claim = await shippingMutation(order.id, "claim_purchase", {
        shipmentId: shipment.id,
        rateId: body.rateId,
      });
      if (!claim.claimed)
        return json(
          {
            message:
              "This shipment already has a purchase attempt. Review or recover its status.",
          },
          409,
        );
      try {
        // Always purchase the thermal original. Letter output is a local PDF conversion.
        const label = await provider.buyLabel(
          body.rateId,
          shipment.external_id,
          "4x6",
        );
        await saveLabel(order.id, shipment, label);
        return json({
          message:
            "Label purchased. Print it, then mark the shipment shipped when dispatched.",
        });
      } catch (error) {
        await shippingMutation(order.id, "purchase_unknown", {
          shipmentId: shipment.id,
        });
        throw error;
      }
    }
    if (action === "recover") {
      if (!provider)
        throw new Error(
          "ShipStation access is needed to recover label status.",
        );
      if (!["purchasing", "unknown"].includes(shipment.status))
        return json({
          message: "Shipment does not have an uncertain purchase.",
        });
      const label = await provider.findLabel(shipment.external_id);
      if (!label)
        return json({
          warning:
            "No label is visible yet. Do not repurchase. Check ShipStation or try Recover status later.",
        });
      await saveLabel(order.id, shipment, label);
      return json({ message: "Purchased label recovered." });
    }
    if (action === "cancel_draft") {
      await shippingMutation(order.id, "cancel", { shipmentId: shipment.id });
      return json({ message: "Draft cancelled. Items are available again." });
    }
    if (action === "mark_shipped" || action === "retry_notification") {
      if (action === "mark_shipped") {
        if (shipment.status !== "shipped") {
          if (!provider || !shipment.label_id)
            throw new Error(
              "ShipStation access is needed to verify this label before dispatch.",
            );
          const label = await provider.getLabel(shipment.label_id);
          if (label.status !== "completed" || label.voided === true)
            throw new Error(
              "This label is not active. Check its status in ShipStation before shipping.",
            );
        }
        await shippingMutation(order.id, "mark_shipped", {
          shipmentId: shipment.id,
        });
      }
      return json({
        message: "Shipment saved.",
        ...(await notifyShipment(order, shipment.id)),
      });
    }
    return json({ error: "Unknown shipping action." }, 400);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Shipping request failed. Please check the shipment status.",
      },
      error instanceof RangeError ? 413 : 400,
    );
  }
}
