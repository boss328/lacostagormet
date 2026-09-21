/** Only explicit packaging in the title is parsed; serving yields are excluded. */
export function inferPackSize(name: string): string | null {
  const title = name.split(/\s-\s/)[0];
  const count =
    title.match(/\(Case of (\d+)\)/i)?.[1] ??
    title.match(/\((\d+)-Pack\b/i)?.[1];
  const size = title.match(
    /\b(\d+(?:\.\d+)?)\s*(fl\s*oz|oz|lbs?|kg|g|mL|L|gallons?)\b/i,
  );
  const normalizeUnit = (unit: string) => {
    const lower = unit.toLowerCase();
    return lower === 'ml'
      ? 'mL'
      : lower === 'l'
        ? 'L'
        : lower === 'lbs'
          ? 'lb'
          : lower;
  };
  if (count && size) return `${count} × ${size[1]} ${normalizeUnit(size[2])}`;
  const variety = title.match(
    /\b(\d+(?:\.\d+)?)\s*(mL|L|oz|lb)\s*x\s*(\d+)\b/i,
  );
  if (variety)
    return `${variety[3]} × ${variety[1]} ${normalizeUnit(variety[2])}`;
  // A pump's dose or compatible bottle size is not a package volume.
  if (/\bpump\b/i.test(title)) return '1 pump';
  if (/\bbaristir\b|\bmixing tool\b/i.test(title)) return '1 mixing tool';
  const sachets = title.match(/\b(\d+)[ -]Count\s+Tea\s+Sa(?:chets|ckets)\b/i);
  if (sachets) return `${sachets[1]} tea sachets`;
  const packets = title.match(/\((\d+)-Count\)/i);
  if (packets && /packets/i.test(title)) return `${packets[1]} packets`;
  if (count) {
    const vessel = title
      .match(/\b(bag|bottle|cup|pouch|carton)s?\b/i)?.[1]
      .toLowerCase();
    return vessel
      ? `${count} ${vessel}${count === '1' ? '' : 's'}`
      : `${count} pack`;
  }
  // A measured single container, not a number buried in a product claim.
  const single = title.match(
    /\b(\d+(?:\.\d+)?)\s*(fl\s*oz|oz|lbs?|kg|g|mL|L)\.?\s+(?:bulk\s+)?(?:bag|pail|box|pouch|jar|canister|bottle|carton)\b/i,
  );
  if (single) return `${single[1]} ${normalizeUnit(single[2])}`;
  const gallon = title.match(/\b(\d+(?:\.\d+)?)-Gallon Bag-in-Box\b/i);
  if (gallon) return `${gallon[1]} gal bag-in-box`;
  return null;
}
