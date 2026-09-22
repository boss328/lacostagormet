export function productCategoryIds(
  primaryId: string,
  previousPrimaryId: string | null,
  existingIds: string[],
  additionalIds?: string[],
) {
  // Older forms omit the additional-category field. Preserve their tags,
  // while allowing a primary-category change to replace the old primary.
  const additional =
    additionalIds ?? existingIds.filter((id) => id !== previousPrimaryId);
  return [...new Set([primaryId, ...additional])];
}
