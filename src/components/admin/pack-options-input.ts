/** Suggest a pack total without changing any saved selling price. */
export function suggestPackPrice(
  basePrice: number,
  baseUnits: number,
  newUnits: number,
  markupPercent: number,
): number | null {
  if (
    !Number.isFinite(basePrice) || basePrice <= 0 ||
    !Number.isInteger(baseUnits) || baseUnits < 1 ||
    !Number.isInteger(newUnits) || newUnits < 1 ||
    !Number.isFinite(markupPercent) || markupPercent < 0 || markupPercent > 1000
  ) return null;
  return Math.max(1, Math.round((basePrice / baseUnits) * newUnits * (1 + markupPercent / 100) * 100)) / 100;
}
