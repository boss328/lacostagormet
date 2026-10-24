export const STOCK_STATUSES = [
  'in_stock', 'low_stock', 'out_of_stock', 'discontinued',
] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export const STOCK_STATUS_OPTIONS: ReadonlyArray<{ value: StockStatus; label: string }> = [
  { value: 'in_stock', label: 'In stock' },
  { value: 'low_stock', label: 'Low stock' },
  { value: 'out_of_stock', label: 'Out of stock' },
  { value: 'discontinued', label: 'Discontinued' },
];

export function isStockStatus(value: unknown): value is StockStatus {
  return typeof value === 'string' && STOCK_STATUSES.some(status => status === value);
}

/** An unknown status must not advertise a product as available to buy. */
export function isAvailableForPurchase(stockStatus: string | null | undefined): boolean {
  return stockStatus === 'in_stock' || stockStatus === 'low_stock';
}
