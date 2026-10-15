/** ShipStation V2 transport. Imported only by server routes; fetch is injectable for tests. */
export type ShippingAddress = {
  name: string;
  phone: string;
  company_name?: string;
  address_line1: string;
  address_line2?: string;
  city_locality: string;
  state_province: string;
  postal_code: string;
  country_code: "US";
  address_residential_indicator?: "yes" | "no" | "unknown";
};
export type ShippingPackage = {
  weightLb: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
};
export type ShippingRate = {
  rateId: string;
  carrier: string;
  service: string;
  amount: number;
  currency: string;
  deliveryDays?: number;
};
export type ProviderLabel = {
  label_id: string;
  status: string;
  shipment_id?: string;
  external_shipment_id?: string;
  tracking_number?: string;
  carrier_code?: string;
  service_code?: string;
  label_layout?: "4x6" | "letter";
  label_download?: { pdf?: string; href?: string };
  shipment_cost?: { amount: number; currency: string };
  insurance_cost?: { amount: number; currency: string };
};
export class ShippingProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number = 502,
  ) {
    super(message);
  }
}
export function normalizeAddress(
  raw: Record<string, unknown>,
): ShippingAddress {
  if (!raw || typeof raw !== "object")
    throw new Error(
      "A complete U.S. shipping address and phone number are required.",
    );
  const str = (key: string) =>
    typeof raw[key] === "string" ? String(raw[key]).trim() : "";
  const country = (str("country_code") || str("country") || "US").toUpperCase();
  if (!["US", "USA", "UNITED STATES"].includes(country))
    throw new Error("This shipping release supports U.S. addresses only.");
  const result: ShippingAddress = {
    name:
      str("name") ||
      [str("first_name"), str("last_name")].filter(Boolean).join(" "),
    phone: str("phone"),
    company_name: str("company_name") || str("company"),
    address_line1: str("address_line1") || str("address1"),
    address_line2: str("address_line2") || str("address2"),
    city_locality: str("city_locality") || str("city"),
    state_province: str("state_province") || str("state"),
    postal_code: str("postal_code") || str("zip"),
    country_code: "US",
    address_residential_indicator: "unknown",
  };
  if (
    [
      result.name,
      result.phone,
      result.address_line1,
      result.city_locality,
      result.state_province,
      result.postal_code,
    ].some((v) => !v || v.length > 200)
  )
    throw new Error(
      "A complete U.S. shipping address and phone number are required.",
    );
  return result;
}
export function validatePackage(value: unknown): ShippingPackage {
  if (!value || typeof value !== "object")
    throw new Error("Enter the package weight and dimensions.");
  const p = value as ShippingPackage;
  if (
    ![p.weightLb, p.lengthIn, p.widthIn, p.heightIn].every(
      (n) => typeof n === "number" && Number.isFinite(n) && n > 0,
    ) ||
    p.weightLb > 150 ||
    Math.max(p.lengthIn, p.widthIn, p.heightIn) > 108
  )
    throw new Error(
      "Enter positive package dimensions (up to 108 inches) and weight (up to 150 lb).",
    );
  return {
    weightLb: p.weightLb,
    lengthIn: p.lengthIn,
    widthIn: p.widthIn,
    heightIn: p.heightIn,
  };
}
export function safeTrackingUrl(
  carrier: string,
  tracking: string,
): string | null {
  const code = carrier.toLowerCase();
  const number = encodeURIComponent(tracking);
  if (code.includes("ups") && !code.includes("usps"))
    return `https://www.ups.com/track?tracknum=${number}`;
  if (code.includes("fedex"))
    return `https://www.fedex.com/fedextrack/?trknbr=${number}`;
  if (
    code.includes("usps") ||
    code.includes("stamps") ||
    code.includes("endicia")
  )
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${number}`;
  if (code.includes("dhl"))
    return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${number}`;
  return null;
}
export function normalizeRates(raw: unknown): ShippingRate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((r: Record<string, unknown>) => {
      if (
        !r ||
        typeof r.rate_id !== "string" ||
        r.validation_status === "invalid" ||
        !r.shipping_amount
      )
        return [];
      const costs = [
        "shipping_amount",
        "insurance_amount",
        "confirmation_amount",
        "other_amount",
        "tax_amount",
      ]
        .map(
          (key) => r[key] as { amount?: number; currency?: string } | undefined,
        )
        .filter(Boolean);
      if (
        !costs.length ||
        costs.some(
          (c) =>
            c?.currency?.toLowerCase() !== "usd" ||
            typeof c.amount !== "number" ||
            !Number.isFinite(c.amount),
        )
      )
        return [];
      const amount =
        Math.round(costs.reduce((sum, c) => sum + c!.amount!, 0) * 100) / 100;
      if (amount < 0) return [];
      return [
        {
          rateId: r.rate_id,
          carrier: String(
            r.carrier_friendly_name || r.carrier_code || "Carrier",
          ),
          service: String(r.service_type || r.service_code || "Shipping"),
          amount,
          currency: "USD",
          ...(typeof r.delivery_days === "number"
            ? { deliveryDays: r.delivery_days }
            : {}),
        },
      ];
    })
    .sort((a, b) => a.amount - b.amount);
}
export class ShipStation {
  constructor(
    private readonly apiKey: string,
    private readonly transport: typeof fetch = fetch,
  ) {}
  private async request<T>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.transport(`https://api.shipstation.com/v2${path}`, {
        method,
        headers: { "API-Key": this.apiKey, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new ShippingProviderError(
        "ShipStation did not respond. Check shipment status before trying another label.",
      );
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      // Do not echo request payloads, private addresses, or provider credentials.
      const message =
        response.status === 401 || response.status === 403
          ? "ShipStation account access needs attention."
          : response.status === 429
            ? "ShipStation is busy. Please retry shortly."
            : "ShipStation could not complete this request. Check the address, package and account settings.";
      throw new ShippingProviderError(message, response.status);
    }
    if (!data)
      throw new ShippingProviderError(
        "ShipStation returned an unreadable response.",
      );
    return data as T;
  }
  async rates(input: {
    externalId: string;
    orderNumber: string;
    shipFrom: ShippingAddress;
    returnTo: ShippingAddress;
    shipTo: ShippingAddress;
    parcel: ShippingPackage;
  }) {
    const carriers = await this.request<{
      carriers: Array<{ carrier_id: string }>;
    }>("/carriers");
    if (!carriers.carriers?.length)
      throw new Error("Connect a carrier in ShipStation before getting rates.");
    const response = await this.request<{
      shipment_id?: string;
      rate_response?: { rates?: unknown; errors?: unknown[] };
    }>("/rates", "POST", {
      rate_options: {
        carrier_ids: carriers.carriers.map((c) => c.carrier_id),
        preferred_currency: "usd",
      },
      shipment: {
        external_shipment_id: input.externalId,
        shipment_number: input.orderNumber,
        validate_address: "validate_only",
        ship_from: input.shipFrom,
        return_to: input.returnTo,
        ship_to: input.shipTo,
        packages: [
          {
            package_code: "package",
            weight: { value: input.parcel.weightLb, unit: "pound" },
            dimensions: {
              length: input.parcel.lengthIn,
              width: input.parcel.widthIn,
              height: input.parcel.heightIn,
              unit: "inch",
            },
          },
        ],
      },
    });
    const rates = normalizeRates(response.rate_response?.rates);
    if (!rates.length)
      throw new Error(
        "No usable rates were returned. Check the address, package and connected carriers.",
      );
    return { providerShipmentId: response.shipment_id ?? null, rates };
  }
  buyLabel(rateId: string, externalId: string, format: "4x6" | "letter") {
    return this.request<ProviderLabel>(
      `/labels/rates/${encodeURIComponent(rateId)}`,
      "POST",
      {
        external_shipment_id: externalId,
        label_format: "pdf",
        label_layout: format,
        label_download_type: "url",
      },
    );
  }
  async findLabel(externalId: string): Promise<ProviderLabel | null> {
    try {
      return await this.request<ProviderLabel>(
        `/labels/external_shipment_id/${encodeURIComponent(externalId)}`,
      );
    } catch (error) {
      if (error instanceof ShippingProviderError && error.status === 404)
        return null;
      throw error;
    }
  }
  getLabel(labelId: string) {
    return this.request<ProviderLabel>(
      `/labels/${encodeURIComponent(labelId)}`,
    );
  }
}
