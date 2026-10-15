"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  safeTrackingUrl,
  selectedShippingItems,
  shippingPackage,
} from "./shipping-input";
import type {
  AdminShipment,
  ShippingOverview,
  ShippingQuote,
  ShippingRate,
} from "./types";

const inputClass =
  "w-full min-h-[44px] border border-rule-strong bg-paper px-3 py-2 text-sm text-ink disabled:opacity-50";
const buttonClass =
  "btn btn-outline min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed";
const statusLabels: Record<string, string> = {
  draft: "Rates requested",
  purchasing: "Confirming label purchase",
  purchase_unknown: "Purchase needs verification",
  unknown: "Purchase needs verification",
  label_created: "Label ready · not shipped",
  shipped: "Shipped",
  failed: "Label not purchased",
  cancelled: "Cancelled",
  voided: "Voided",
};

function money(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    amount,
  );
}

export function OrderShippingPanel({ orderNumber }: { orderNumber: string }) {
  const router = useRouter();
  const endpoint = `/api/admin/orders/${encodeURIComponent(orderNumber)}/shipping/`;
  const [overview, setOverview] = useState<ShippingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const actionLock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<"label" | "manual" | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [packageValues, setPackageValues] = useState({
    weightLb: "",
    lengthIn: "",
    widthIn: "",
    heightIn: "",
  });
  const [quote, setQuote] = useState<ShippingQuote | null>(null);
  const [rateId, setRateId] = useState("");
  const [carrier, setCarrier] = useState("USPS");
  const [tracking, setTracking] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok)
      throw new Error(
        body.errorMessage || body.error || "Could not load shipping details.",
      );
    setOverview(body as ShippingOverview);
  }, [endpoint]);

  useEffect(() => {
    let active = true;
    load()
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load shipping details.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  async function post<T>(
    action: string,
    payload: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        body.errorMessage ||
          body.error ||
          "The shipping request could not be completed.",
      );
    return body as T;
  }

  async function run(key: string, task: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await task();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The request could not be completed. Refresh shipping details before retrying.",
      );
      // A failed response may follow a successful reservation or dispatch.
      await load().catch(() => {});
      router.refresh();
    } finally {
      actionLock.current = false;
      setBusy(null);
    }
  }

  async function requestRates() {
    if (!overview) return;
    await run("rates", async () => {
      const items = selectedShippingItems(overview.items, quantities);
      const packageInput = shippingPackage(packageValues);
      const result = await post<ShippingQuote>("rates", {
        items,
        package: packageInput,
      });
      setQuote(result);
      setRateId("");
      await load();
      if (!result.rates.length)
        setMessage(
          "No rates were returned. Cancel this draft to change the package and try again.",
        );
    });
  }

  async function cancelDraft(shipmentId: string) {
    await run(`cancel:${shipmentId}`, async () => {
      await post("cancel_draft", { shipmentId });
      if (quote?.shipmentId === shipmentId) {
        setQuote(null);
        setRateId("");
      }
      await load();
      setMessage("Draft cancelled. Its items are available to select again.");
    });
  }

  async function buyLabel() {
    if (!quote || !rateId) return;
    await run("buy", async () => {
      const shipmentId = quote.shipmentId;
      // Discard the quote before requesting a purchase. If the connection fails,
      // recovery uses this shipment's immutable ID instead of buying again.
      setQuote(null);
      setRateId("");
      setQuantities({});
      try {
        await post("buy_label", { shipmentId, rateId });
        setMessage(
          "Label purchased. Print it below, then mark the shipment shipped when the package is dispatched.",
        );
      } catch (reason) {
        throw new Error(
          `${reason instanceof Error ? reason.message : "Purchase status could not be confirmed."} Use Recover status on this shipment before trying another purchase.`,
        );
      } finally {
        await load();
        router.refresh();
      }
    });
  }

  async function shipmentAction(
    action: "recover" | "mark_shipped" | "retry_notification",
    shipmentId: string,
  ) {
    await run(`${action}:${shipmentId}`, async () => {
      const result = await post<{ message?: string; warning?: string }>(
        action,
        { shipmentId },
      );
      await load();
      router.refresh();
      setMessage(
        result.warning ||
          result.message ||
          (action === "recover"
            ? "Shipment status refreshed. Review the details below."
            : "Shipment marked shipped."),
      );
    });
  }

  async function recordManual() {
    if (!overview) return;
    await run("manual", async () => {
      const items = selectedShippingItems(overview.items, quantities);
      if (!tracking.trim())
        throw new Error("Enter the tracking number from the shipping label.");
      const result = await post<{ warning?: string }>("manual_tracking", {
        items,
        carrier,
        trackingNumber: tracking.trim(),
      });
      setQuantities({});
      setTracking("");
      await load();
      router.refresh();
      setMessage(
        result.warning || "Shipment marked shipped and customer notified.",
      );
    });
  }

  const chosenRate = quote?.rates.find((rate) => rate.rateId === rateId);
  const config = overview?.configuration;
  const selectedMode = mode ?? (config?.canQuote ? "label" : "manual");
  const canPrepare =
    !!quote ||
    (!!config &&
      (config.canQuote || config.canRecordManual) &&
      !!overview?.items.some((item) => item.availableQuantity > 0));
  const locked = !!busy || !!quote;

  return (
    <section
      id="local-shipping"
      className="mt-8 border border-rule-strong bg-cream p-5 sm:p-6"
      aria-labelledby="local-shipping-heading"
      aria-busy={!!busy || loading}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2
            id="local-shipping-heading"
            className="font-display text-2xl text-brand-deep"
          >
            Ship from my location
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            Choose the items in this package. Items assigned to a supplier or
            another shipment stay reserved for that shipment.
          </p>
        </div>
        <button
          type="button"
          className={buttonClass}
          disabled={!!busy || loading}
          onClick={() => run("refresh", load)}
        >
          {busy === "refresh" ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {loading && (
        <p className="mt-5 text-sm text-ink-muted" role="status">
          Loading shipping details…
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-5 border border-accent bg-paper p-3 text-sm text-accent"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="mt-5 border border-rule bg-paper p-3 text-sm text-ink"
        >
          {message}
        </p>
      )}
      {overview?.notice && (
        <p className="mt-5 border border-rule bg-paper p-3 text-sm text-ink-muted">
          {overview.notice}
        </p>
      )}

      {overview && !canPrepare && overview.items.every((item) => item.availableQuantity === 0) && (
        <div className="mt-5 text-sm text-ink-muted">
          <p>No items are available for a new local shipment.</p>
          {overview.items.some((item) => item.blockedReason) && (
            <ul className="mt-2 space-y-1">
              {overview.items.filter((item) => item.blockedReason).map((item) => (
                <li key={item.orderItemId}>{item.name}: {item.blockedReason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {overview && canPrepare && (
        <>
          <fieldset className="mt-6" disabled={locked}>
            <legend className="type-label text-ink mb-3">
              1. Select items
            </legend>
            {overview.items.length === 0 && (
              <p className="text-sm text-ink-muted">
                No items are recorded for this order.
              </p>
            )}
            <div className="divide-y divide-rule border-y border-rule">
              {overview.items.map((item) => (
                <div
                  key={item.orderItemId}
                  className="flex items-center justify-between gap-4 py-4"
                >
                  <div className="min-w-0">
                    <label
                      htmlFor={`ship-quantity-${item.orderItemId}`}
                      className="text-sm font-medium text-ink"
                    >
                      {item.name}
                    </label>
                    <p className="mt-1 text-xs text-ink-muted">
                      {item.sku} · {item.availableQuantity} available ·{" "}
                      {item.shippedQuantity} shipped · {item.reservedQuantity}{" "}
                      reserved
                    </p>
                    {item.blockedReason && (
                      <p className="mt-1 text-xs text-ink-muted">
                        {item.blockedReason}
                      </p>
                    )}
                  </div>
                  <div className="w-20 shrink-0">
                    <span
                      className="mb-1 block text-xs text-ink-muted"
                      aria-hidden="true"
                    >
                      Quantity
                    </span>
                    <input
                      id={`ship-quantity-${item.orderItemId}`}
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max={item.availableQuantity}
                      step="1"
                      disabled={item.availableQuantity === 0 || locked}
                      className={inputClass}
                      value={quantities[item.orderItemId] ?? "0"}
                      onChange={(event) =>
                        setQuantities((previous) => ({
                          ...previous,
                          [item.orderItemId]: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </fieldset>

          {!quote && (
            <div className="mt-6">
              <div
                className="mb-5 flex flex-wrap gap-2"
                aria-label="Shipment method"
              >
                <button
                  type="button"
                  aria-pressed={selectedMode === "label"}
                  disabled={!!busy}
                  onClick={() => setMode("label")}
                  className={`${buttonClass} ${selectedMode === "label" ? "bg-paper font-semibold" : ""}`}
                >
                  Buy a shipping label
                </button>
                <button
                  type="button"
                  aria-pressed={selectedMode === "manual"}
                  disabled={!!busy}
                  onClick={() => setMode("manual")}
                  className={`${buttonClass} ${selectedMode === "manual" ? "bg-paper font-semibold" : ""}`}
                >
                  I already have tracking
                </button>
              </div>
              {selectedMode === "label" ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void requestRates();
                  }}
                >
                  <fieldset disabled={!!busy || !config?.canQuote}>
                    <legend className="type-label text-ink mb-3">
                      2. Package details
                    </legend>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {(
                        [
                          ["weightLb", "Weight (lb)"],
                          ["lengthIn", "Length (in)"],
                          ["widthIn", "Width (in)"],
                          ["heightIn", "Height (in)"],
                        ] as const
                      ).map(([key, label]) => (
                        <label key={key} className="text-sm text-ink">
                          {label}
                          <input
                            className={`${inputClass} mt-2`}
                            type="number"
                            inputMode="decimal"
                            min="0.01"
                            max={key === "weightLb" ? 150 : 108}
                            step="any"
                            required
                            value={packageValues[key]}
                            onChange={(event) =>
                              setPackageValues((previous) => ({
                                ...previous,
                                [key]: event.target.value,
                              }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-ink-muted">
                      Use the packed box’s full weight and outside dimensions.
                      Rates use the saved ship-from address and this order’s
                      delivery address.
                    </p>
                    <button
                      type="submit"
                      className={`${buttonClass} mt-5`}
                      disabled={!!busy || !config?.canQuote}
                    >
                      {busy === "rates"
                        ? "Getting rates…"
                        : "Compare shipping rates"}
                    </button>
                  </fieldset>
                </form>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void recordManual();
                  }}
                >
                  <fieldset disabled={!!busy || !config?.canRecordManual}>
                    <legend className="type-label text-ink mb-3">
                      2. Add existing tracking
                    </legend>
                    <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                      <label className="text-sm text-ink">
                        Carrier
                        <select
                          className={`${inputClass} mt-2`}
                          value={carrier}
                          onChange={(event) => setCarrier(event.target.value)}
                        >
                          <option>USPS</option>
                          <option>UPS</option>
                          <option>FedEx</option>
                          <option>DHL</option>
                          <option>Other</option>
                        </select>
                      </label>
                      <label className="text-sm text-ink">
                        Tracking number
                        <input
                          className={`${inputClass} mt-2`}
                          required
                          maxLength={100}
                          value={tracking}
                          onChange={(event) => setTracking(event.target.value)}
                          autoComplete="off"
                        />
                      </label>
                    </div>
                    <p className="mt-3 text-xs text-ink-muted">
                      Use this after dispatching the package. It marks the
                      selected items shipped and emails the customer their
                      tracking number. No postage is purchased.
                    </p>
                    <button
                      type="submit"
                      className={`${buttonClass} mt-5`}
                      disabled={!!busy || !config?.canRecordManual}
                    >
                      {busy === "manual"
                        ? "Marking shipped…"
                        : "Mark shipped & notify customer"}
                    </button>
                  </fieldset>
                </form>
              )}
            </div>
          )}

          {quote && (
            <div className="mt-6 border border-rule-strong bg-paper p-4 sm:p-5">
              <fieldset disabled={!!busy || !config?.canPurchase}>
                <legend className="type-label text-ink mb-3">
                  3. Choose a service
                </legend>
                <div className="space-y-2">
                  {quote.rates.map((rate) => (
                    <RateOption
                      key={rate.rateId}
                      rate={rate}
                      selected={rate.rateId === rateId}
                      onSelect={() => setRateId(rate.rateId)}
                    />
                  ))}
                </div>
              </fieldset>
              <p className="mt-4 text-sm text-ink-muted">
                Buying a label charges the connected shipping account. Print on
                4 × 6 or Letter paper afterward. The package is marked shipped
                and the customer notified only when you confirm dispatch.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="btn btn-solid min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!!busy || !chosenRate || !config?.canPurchase}
                  onClick={buyLabel}
                >
                  {busy === "buy"
                    ? "Purchasing label…"
                    : chosenRate
                      ? `Buy label · ${money(chosenRate.amount, chosenRate.currency)}`
                      : "Choose a rate to buy a label"}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!!busy}
                  onClick={() => cancelDraft(quote.shipmentId)}
                >
                  Cancel / change package
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {overview && (
        <div className="mt-8 border-t border-rule-strong pt-6">
          <h3 className="type-label text-ink">Shipment history</h3>
          {overview.shipments.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">
              No local shipments yet. Supplier shipments remain listed with
              their purchase orders.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {overview.shipments.map((shipment) => (
                <ShipmentCard
                  key={shipment.id}
                  orderNumber={orderNumber}
                  shipment={shipment}
                  busy={busy}
                  canWrite={!!config?.canRecordManual}
                  activeQuoteId={quote?.shipmentId}
                  onCancel={cancelDraft}
                  onAction={shipmentAction}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function RateOption({
  rate,
  selected,
  onSelect,
}: {
  rate: ShippingRate;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 border p-3 ${selected ? "border-brand bg-cream" : "border-rule"}`}
    >
      <input
        type="radio"
        name="shipping-rate"
        checked={selected}
        onChange={onSelect}
      />
      <span className="min-w-0 flex-1 text-sm text-ink">
        <span className="block font-medium">
          {rate.carrier} · {rate.service}
        </span>
        {rate.deliveryDays != null && (
          <span className="mt-1 block text-xs text-ink-muted">
            Estimated {rate.deliveryDays} business{" "}
            {rate.deliveryDays === 1 ? "day" : "days"}
          </span>
        )}
      </span>
      <span className="shrink-0 text-sm font-semibold text-brand-deep">
        {money(rate.amount, rate.currency)}
      </span>
    </label>
  );
}

function ShipmentCard({
  orderNumber,
  shipment,
  busy,
  canWrite,
  activeQuoteId,
  onCancel,
  onAction,
}: {
  orderNumber: string;
  shipment: AdminShipment;
  busy: string | null;
  canWrite: boolean;
  activeQuoteId?: string;
  onCancel: (id: string) => Promise<void>;
  onAction: (
    action: "recover" | "mark_shipped" | "retry_notification",
    id: string,
  ) => Promise<void>;
}) {
  const trackingUrl = safeTrackingUrl(shipment.trackingUrl);
  const uncertain = ["purchasing", "purchase_unknown", "unknown"].includes(
    shipment.status,
  );
  return (
    <article className="border border-rule bg-paper p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-brand-deep">
            {statusLabels[shipment.status] ??
              shipment.status.replaceAll("_", " ")}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {new Date(shipment.createdAt).toLocaleString("en-US")}
            {shipment.carrier ? ` · ${shipment.carrier}` : ""}
            {shipment.service ? ` · ${shipment.service}` : ""}
          </p>
        </div>
        {shipment.postageCents != null && (
          <p className="text-sm text-ink">
            Postage {money(shipment.postageCents / 100)}
          </p>
        )}
      </div>
      <ul className="my-3 space-y-1 text-sm text-ink">
        {shipment.items.map((item) => (
          <li key={item.orderItemId}>
            {item.quantity} × {item.name}
          </li>
        ))}
      </ul>
      {shipment.trackingNumber &&
        (trackingUrl ? (
          <a
            href={trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-sm text-brand-deep underline underline-offset-4"
          >
            Track {shipment.trackingNumber} ↗
          </a>
        ) : (
          <p className="break-all text-sm text-ink">
            Tracking: {shipment.trackingNumber}
          </p>
        ))}
      {shipment.error && (
        <p className="mt-3 text-sm text-accent">{shipment.error}</p>
      )}
      {uncertain && (
        <p className="mt-3 text-sm text-ink-muted">
          Confirm this purchase’s status before creating another label for these
          items.
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={`/admin/orders/${encodeURIComponent(orderNumber)}/print/?type=packing-slip&items=${encodeURIComponent(JSON.stringify(shipment.items.map((item) => ({ id: item.orderItemId, quantity: item.quantity }))))}`}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass}
        >
          Print this packing slip
        </a>
        {shipment.label4x6Url && (
          <a
            href={shipment.label4x6Url}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass}
          >
            Print 4 × 6 label
          </a>
        )}
        {shipment.labelLetterUrl && (
          <a
            href={shipment.labelLetterUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass}
          >
            Print Letter label
          </a>
        )}
        {shipment.status === "label_created" && (
          <button
            type="button"
            disabled={!!busy || !canWrite}
            className="btn btn-solid min-h-[44px] disabled:opacity-50"
            onClick={() => onAction("mark_shipped", shipment.id)}
          >
            {busy === `mark_shipped:${shipment.id}`
              ? "Marking shipped…"
              : "Mark shipped & notify customer"}
          </button>
        )}
        {uncertain && (
          <button
            type="button"
            disabled={!!busy || !canWrite}
            className={buttonClass}
            onClick={() => onAction("recover", shipment.id)}
          >
            {busy === `recover:${shipment.id}`
              ? "Checking purchase…"
              : "Recover status"}
          </button>
        )}
        {shipment.status === "shipped" &&
          shipment.notificationState !== "sent" && (
            <button
              type="button"
              disabled={!!busy || !canWrite}
              className={buttonClass}
              onClick={() => onAction("retry_notification", shipment.id)}
            >
              {busy === `retry_notification:${shipment.id}`
                ? "Checking notification…"
                : "Retry customer notification"}
            </button>
          )}
        {["draft", "failed"].includes(shipment.status) &&
          shipment.id !== activeQuoteId && (
            <button
              type="button"
              disabled={!!busy || !canWrite}
              className={buttonClass}
              onClick={() => onCancel(shipment.id)}
            >
              {busy === `cancel:${shipment.id}`
                ? "Cancelling…"
                : "Cancel draft & release items"}
            </button>
          )}
      </div>
      {(shipment.label4x6Url || shipment.labelLetterUrl) && (
        <p className="mt-3 text-xs text-ink-muted">
          Printing again uses the saved label and does not purchase postage.
        </p>
      )}
      {shipment.status === "shipped" && (
        <p className="mt-3 text-xs text-ink-muted">
          {shipment.notificationState === "sent"
            ? "Customer notification sent."
            : "Customer notification is pending. Retry after two minutes; contact support if it remains pending."}
        </p>
      )}
    </article>
  );
}
