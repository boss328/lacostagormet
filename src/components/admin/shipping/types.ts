export type ShippingItem = {
  orderItemId: string;
  name: string;
  sku: string;
  orderedQuantity: number;
  availableQuantity: number;
  reservedQuantity: number;
  shippedQuantity: number;
  blockedReason?: string | null;
};

export type ShippingSelection = { orderItemId: string; quantity: number };

export type AdminShipment = {
  id: string;
  status: string;
  items: Array<ShippingSelection & { name: string }>;
  carrier?: string | null;
  service?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  label4x6Url?: string | null;
  labelLetterUrl?: string | null;
  postageCents?: number | null;
  createdAt: string;
  error?: string | null;
  notificationState?: "idle" | "sending" | "sent" | "failed";
};

export type ShippingOverview = {
  enabled: boolean;
  ready: boolean;
  notice?: string | null;
  configuration: {
    canQuote: boolean;
    canPurchase: boolean;
    canRecordManual: boolean;
  };
  items: ShippingItem[];
  shipments: AdminShipment[];
};

export type ShippingRate = {
  rateId: string;
  carrier: string;
  service: string;
  amount: number;
  currency: string;
  deliveryDays?: number | null;
};

export type ShippingQuote = { shipmentId: string; rates: ShippingRate[] };
