import type { ShippingItem, ShippingSelection } from "./types";

export function selectedShippingItems(
  items: ShippingItem[],
  quantities: Record<string, string>,
): ShippingSelection[] {
  const selected: ShippingSelection[] = [];
  for (const item of items) {
    const value = quantities[item.orderItemId];
    if (!value || Number(value) === 0) continue;
    const quantity = Number(value);
    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > item.availableQuantity
    ) {
      throw new Error(
        `Choose a whole quantity from 0 to ${item.availableQuantity} for ${item.name}.`,
      );
    }
    selected.push({ orderItemId: item.orderItemId, quantity });
  }
  if (!selected.length)
    throw new Error("Choose at least one item to ship from your location.");
  return selected;
}

export function shippingPackage(
  values: Record<"weightLb" | "lengthIn" | "widthIn" | "heightIn", string>,
) {
  const result = {
    weightLb: Number(values.weightLb),
    lengthIn: Number(values.lengthIn),
    widthIn: Number(values.widthIn),
    heightIn: Number(values.heightIn),
  };
  if (
    Object.values(result).some((value) => !Number.isFinite(value) || value <= 0)
  ) {
    throw new Error(
      "Enter a package weight and all three dimensions greater than zero.",
    );
  }
  return result;
}

export function safeTrackingUrl(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
