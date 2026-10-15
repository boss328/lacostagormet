export type DocumentLine = {
  id: string;
  product_sku: string;
  product_name: string;
  quantity: number;
};

export type InvoiceLine = DocumentLine & {
  unit_price: number | string;
  line_subtotal: number | string;
};

export type PackingSelection = { id: string; quantity: number };
export type DocumentAddress = Record<string, string | undefined> | null;

export type DocumentOrder = {
  order_number: string;
  status: string;
  customer_email: string;
  created_at: string;
  shipping_address: DocumentAddress;
  billing_address: DocumentAddress;
  subtotal: number | string;
  discount: number | string;
  shipping_cost: number | string;
  tax: number | string;
  total: number | string;
};

/** Selections always refer to this order's recorded lines, never product IDs. */
export function selectPackingLines(
  lines: DocumentLine[],
  raw: string | string[] | undefined,
): { lines: DocumentLine[]; error: null } | { lines: []; error: string } {
  const onlyPackingFields = (line: DocumentLine, quantity = line.quantity) => ({
    id: line.id,
    product_sku: line.product_sku,
    product_name: line.product_name,
    quantity,
  });
  if (raw === undefined) return { lines: lines.map((line) => onlyPackingFields(line)), error: null };
  const invalid = { lines: [] as [], error: 'Select at least one item and use whole quantities within the amount ordered.' };
  if (typeof raw !== 'string' || raw.length > 20_000) return invalid;

  let selection: unknown;
  try {
    selection = JSON.parse(raw);
  } catch {
    return invalid;
  }
  if (!Array.isArray(selection) || selection.length === 0 || selection.length > lines.length) return invalid;

  const byId = new Map(lines.map((line) => [line.id, line]));
  const quantities = new Map<string, number>();
  for (const selected of selection) {
    if (!selected || typeof selected !== 'object') return invalid;
    const { id, quantity } = selected;
    const line = typeof id === 'string' ? byId.get(id) : undefined;
    if (!line || quantities.has(id) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > line.quantity) return invalid;
    quantities.set(id, quantity);
  }
  return {
    lines: lines.filter((line) => quantities.has(line.id)).map((line) => onlyPackingFields(line, quantities.get(line.id))),
    error: null,
  };
}

export function documentMoney(value: number | string): string {
  const amount = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(amount)) throw new Error('The order contains an invalid recorded amount.');
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

/** Display snapshots from checkout. Never recalculate an old order from today's catalog. */
export function invoiceTotals(order: Pick<DocumentOrder, 'subtotal' | 'discount' | 'shipping_cost' | 'tax' | 'total'>) {
  return [
    { label: 'Subtotal', value: documentMoney(order.subtotal) },
    ...(Number(order.discount) !== 0 ? [{ label: 'Discount', value: documentMoney(-Number(order.discount)) }] : []),
    { label: 'Shipping', value: documentMoney(order.shipping_cost) },
    { label: 'Tax', value: documentMoney(order.tax) },
    { label: 'Order total (USD)', value: documentMoney(order.total) },
  ];
}

export function documentPaymentStatus(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Awaiting payment',
    paid: 'Paid',
    payment_held: 'Payment under review',
    refunded: 'Refunded',
    partially_refunded: 'Partially refunded',
    cancelled: 'Cancelled',
  };
  return labels[status] ?? status.replace(/_/g, ' ');
}

export function addressLines(address: DocumentAddress): string[] {
  if (!address) return [];
  return [
    address.company,
    [address.first_name, address.last_name].filter(Boolean).join(' '),
    address.address1,
    address.address2,
    [address.city, [address.state, address.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    address.country,
  ].filter((line): line is string => Boolean(line?.trim()));
}
