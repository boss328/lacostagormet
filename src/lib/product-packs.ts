import { isStockStatus, type StockStatus } from './product-availability';

export type PackOption = {
  id: string;
  sku: string;
  name: string;
  slug: string;
  description: string | null;
  retail_price: number;
  units_per_pack: number | null;
  pack_unit_label: string | null;
  weight_lb: number | null;
  stock_status: StockStatus;
  is_active: boolean;
  vendor_id: string | null;
  primary_image_url: string | null;
};

export type PackOptionsResponse = {
  ok: true;
  parentId: string;
  options: PackOption[];
  vendors: Array<{ id: string; name: string; is_self_fulfilled: boolean }>;
  images: Array<{ id: string; url: string; alt_text: string | null; product_id: string }>;
};

export type PackOptionInput = {
  sku: string;
  name: string;
  slug: string;
  retail_price: number;
  units_per_pack: number;
  parent_units_per_pack: number;
  pack_unit_label: string;
  weight_lb: number;
  vendor_id: string;
  description: string;
  primary_image_url: string | null;
  stock_status: StockStatus;
  is_active: boolean;
};

export class PackInputError extends Error {}

export function isPackProductId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function cents(price: number): number | null {
  if (!Number.isFinite(price) || price < 0) return null;
  const value = Math.round(price * 100);
  return Number.isSafeInteger(value) ? value : null;
}

/** Display rounding only. Savings compare total integer cents before division. */
export function packUnitPrice(price: number, units: number | null | undefined): number | null {
  const total = cents(price);
  if (total === null || !units || !Number.isInteger(units) || units < 1) return null;
  return Math.round(total / units) / 100;
}

export function packSavingsPercent(price: number, units: number, singlePrice: number): number | null {
  const total = cents(price);
  const single = cents(singlePrice);
  if (total === null || single === null || single <= 0 || !Number.isInteger(units) || units <= 1) return null;
  const individualTotal = single * units;
  if (!Number.isSafeInteger(individualTotal) || total >= individualTotal) return null;
  const savings = Math.floor((individualTotal - total) * 100 / individualTotal);
  return savings > 0 ? savings : null;
}

export function packLabel(units: number, label = 'pack'): string {
  return `${units} ${label}`;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PackInputError('Send pack details as a JSON object.');
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw new PackInputError(`${field} must be ${min}–${max} characters.`);
  }
  return value.trim();
}

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 1000) {
    throw new PackInputError('Pack counts must be whole numbers from 1 to 1,000.');
  }
  return value;
}

function positiveAmount(value: unknown, field: string, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > max || Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) {
    throw new PackInputError(`${field} must be positive with at most two decimal places.`);
  }
  return value;
}

function unitLabel(value: unknown): string {
  const label = text(value, 'Unit label', 1, 30);
  if (!/^[a-zA-Z][a-zA-Z -]*$/.test(label)) throw new PackInputError('Use a simple unit label, such as bag, bottle, or carton.');
  return label.toLowerCase();
}

export function parsePackConfiguration(value: unknown): { units_per_pack: number; pack_unit_label: string } {
  const input = record(value);
  return { units_per_pack: count(input.units_per_pack), pack_unit_label: unitLabel(input.pack_unit_label) };
}

export function parsePackOptionInput(value: unknown): PackOptionInput {
  const input = record(value);
  const sku = text(input.sku, 'SKU', 2, 50);
  if (!/^[a-zA-Z0-9_-]+$/.test(sku)) throw new PackInputError('SKU may contain letters, numbers, dashes, and underscores.');
  const slug = text(input.slug, 'URL slug', 2, 200);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new PackInputError('URL slug must use lowercase letters, numbers, and single dashes.');
  if (!isPackProductId(input.vendor_id)) throw new PackInputError('Choose who fulfills this pack option.');
  const units = count(input.units_per_pack);
  const parentUnits = count(input.parent_units_per_pack);
  if (units === parentUnits) throw new PackInputError('This pack count already belongs to the original product.');
  const stock = input.stock_status ?? 'out_of_stock';
  if (!isStockStatus(stock)) throw new PackInputError('Choose a valid stock status.');
  if (input.is_active !== undefined && typeof input.is_active !== 'boolean') throw new PackInputError('Product visibility must be true or false.');
  const image = input.primary_image_url == null || input.primary_image_url === '' ? null : text(input.primary_image_url, 'Image URL', 1, 2048);
  if (input.is_active === true && !image) throw new PackInputError('Choose a product image before publishing this pack option. You can save a draft without one.');
  return {
    sku,
    name: text(input.name, 'Name', 2, 200),
    slug,
    retail_price: positiveAmount(input.retail_price, 'Price', 99999999.99),
    units_per_pack: units,
    parent_units_per_pack: parentUnits,
    pack_unit_label: unitLabel(input.pack_unit_label),
    weight_lb: positiveAmount(input.weight_lb, 'Shipping weight', 9999.99),
    vendor_id: input.vendor_id,
    description: text(input.description, 'Description', 10, 5000),
    primary_image_url: image,
    stock_status: stock,
    is_active: input.is_active === true,
  };
}
