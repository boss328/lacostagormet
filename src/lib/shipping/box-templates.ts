/** Reusable outside box dimensions. Packed shipment weight is entered separately. */
export type ShippingBoxTemplate = {
  id: string;
  name: string;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  updatedAt: string;
};

type BoxTemplateRow = {
  id: string;
  name: string;
  length_in: number;
  width_in: number;
  height_in: number;
  updated_at: string;
};

export class BoxTemplateInputError extends Error {}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BoxTemplateInputError('Send box template details as a JSON object.');
  }
  return value as Record<string, unknown>;
}

export function parseBoxTemplateInput(value: unknown) {
  const input = object(value);
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 80) {
    throw new BoxTemplateInputError('Enter a box name between 1 and 80 characters.');
  }
  const dimensions = [input.lengthIn, input.widthIn, input.heightIn];
  if (!dimensions.every((dimension) => typeof dimension === 'number' && Number.isFinite(dimension) && dimension > 0 && dimension <= 108)) {
    throw new BoxTemplateInputError('Enter positive box dimensions up to 108 inches.');
  }
  return {
    name,
    lengthIn: input.lengthIn as number,
    widthIn: input.widthIn as number,
    heightIn: input.heightIn as number,
  };
}

/** Keep PostgreSQL's full fractional seconds; Date.toISOString would lose them. */
export function parseBoxTemplateVersion(value: unknown) {
  const input = object(value);
  if (typeof input.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id)) {
    throw new BoxTemplateInputError('Choose a valid saved box.');
  }
  const timestamp = typeof input.updatedAt === 'string' ? input.updatedAt : '';
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.exec(timestamp);
  if (!parts || !Number.isFinite(Date.parse(timestamp))) {
    throw new BoxTemplateInputError('Refresh saved boxes before changing this box.');
  }
  const [, year, month, day, hour, minute, second] = parts.map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) {
    throw new BoxTemplateInputError('Refresh saved boxes before changing this box.');
  }
  return { id: input.id, updatedAt: timestamp };
}

export function boxTemplateFromRow(row: BoxTemplateRow): ShippingBoxTemplate {
  return {
    id: row.id,
    name: row.name,
    lengthIn: row.length_in,
    widthIn: row.width_in,
    heightIn: row.height_in,
    updatedAt: row.updated_at,
  };
}
