import "server-only";
import { normalizeAddress, type ShippingAddress } from "./shipstation";
import { shippingFlags } from "./flags";

export function shippingConfiguration() {
  let shipFrom: ShippingAddress | null = null;
  let returnTo: ShippingAddress | null = null;
  try {
    shipFrom = normalizeAddress(
      JSON.parse(process.env.SHIPSTATION_SHIP_FROM_JSON || "{}"),
    );
    returnTo = normalizeAddress(
      JSON.parse(
        process.env.SHIPSTATION_RETURN_TO_JSON ||
          process.env.SHIPSTATION_SHIP_FROM_JSON ||
          "{}",
      ),
    );
  } catch {
    /* Setup is reported through the admin panel, without exposing secrets. */
  }
  const apiKey = process.env.SHIPSTATION_API_KEY || "";
  const ready = Boolean(apiKey && shipFrom && returnTo);
  const flags = shippingFlags(process.env, ready);
  return {
    enabled: flags.enabled,
    ready,
    apiKey,
    shipFrom,
    returnTo,
    canQuote: flags.canQuote,
    canPurchase: flags.canPurchase,
    canRecordManual: flags.canRecordManual,
    notice: !flags.enabled
      ? "Shipping tools are awaiting activation. Printable invoices and packing slips are available."
      : flags.readOnlyPreview
        ? "Preview: postage purchases and shipment changes are disabled."
        : !ready
          ? "Manual tracking is available. Finish ShipStation API access and ship-from/return-address setup to buy labels."
          : !flags.purchaseEnabled
            ? "Rates are available. Label purchasing is awaiting activation."
            : null,
  };
}
