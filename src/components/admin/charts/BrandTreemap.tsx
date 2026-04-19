import { WidgetFrame } from '@/components/admin/charts/WidgetFrame';
import type { BrandBreakdown } from '@/lib/admin/analytics';

/**
 * Hand-rolled treemap — recharts' Treemap is finicky with small palettes
 * and we want tight control over typography. This implementation uses a
 * squarified layout (rows of roughly-equal aspect ratio) which looks
 * neater for the typical 8–12 brand count.
 */
export function BrandTreemap({ brands }: { brands: BrandBreakdown[] }) {
  const totalRevenue = brands.reduce((s, b) => s + b.revenue, 0);
  const topBrand = brands[0];

  // Top 10 brands — the rest collapse into "Other".
  const capped = (() => {
    if (brands.length <= 10) return brands;
    const top = brands.slice(0, 9);
    const other = brands.slice(9).reduce(
      (acc, b) => ({ revenue: acc.revenue + b.revenue, orders: acc.orders + b.orders }),
      { revenue: 0, orders: 0 },
    );
    return [...top, { brand: 'Other', revenue: other.revenue, orders: other.orders }];
  })();

  const width = 100; // use % — container-relative
  const height = 100;
  const cells = layoutTreemap(capped, width, height);

  return (
    <WidgetFrame
      numeral="VI"
      eyebrow="Vendor breakdown"
      title={
        <>
          Revenue by <em className="type-accent">brand</em>.
        </>
      }
      cornerValue={topBrand ? `${topBrand.brand} leads` : '—'}
      cornerHint={
        topBrand && totalRevenue > 0
          ? `${Math.round((topBrand.revenue / totalRevenue) * 100)}% of revenue`
          : undefined
      }
      minHeight={320}
    >
      <div
        className="relative"
        style={{ height: 260, border: '1px solid var(--rule)' }}
      >
        {cells.map((c) => {
          const share = totalRevenue > 0 ? c.item.revenue / totalRevenue : 0;
          const bg = shadeFor(share);
          const light = share < 0.15;
          return (
            <div
              key={c.item.brand}
              className="absolute overflow-hidden transition-colors duration-200"
              style={{
                left: `${c.x}%`,
                top: `${c.y}%`,
                width: `${c.w}%`,
                height: `${c.h}%`,
                background: bg,
                color: light ? 'var(--color-ink)' : 'var(--color-cream)',
                border: '1px solid rgba(26, 17, 10, 0.12)',
                padding: '8px 10px',
              }}
              title={`${c.item.brand} · $${c.item.revenue.toFixed(2)} · ${c.item.orders} line items`}
            >
              <p
                className="font-display truncate"
                style={{ fontSize: c.w > 25 ? '14px' : '11px', letterSpacing: '-0.01em' }}
              >
                {c.item.brand}
              </p>
              <p
                className="font-mono"
                style={{
                  fontSize: c.w > 20 ? '11px' : '9px',
                  letterSpacing: '0.04em',
                  opacity: 0.85,
                  marginTop: 2,
                }}
              >
                ${Math.round(c.item.revenue).toLocaleString()}
              </p>
            </div>
          );
        })}
      </div>
    </WidgetFrame>
  );
}

function shadeFor(share: number): string {
  if (share >= 0.4) return 'var(--color-brand-deep)';
  if (share >= 0.2) return 'var(--color-brand)';
  if (share >= 0.1) return 'rgba(122, 59, 27, 0.7)';
  if (share >= 0.05) return 'rgba(184, 138, 72, 0.65)';
  if (share >= 0.02) return 'rgba(212, 169, 97, 0.45)';
  return 'var(--color-paper-2)';
}

// Simple row-based treemap — packs items greedily into rows along the
// longer axis, then fills each row proportionally. Not pixel-perfect
// squarified but good enough for a dashboard band.
function layoutTreemap(
  items: BrandBreakdown[],
  width: number,
  height: number,
): Array<{ item: BrandBreakdown; x: number; y: number; w: number; h: number }> {
  const total = items.reduce((s, b) => s + b.revenue, 0);
  if (total === 0 || items.length === 0) return [];

  const cells: Array<{ item: BrandBreakdown; x: number; y: number; w: number; h: number }> = [];
  const rows = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(items.length / 2))));
  const perRow = Math.ceil(items.length / rows);

  let cursor = 0;
  for (let r = 0; r < rows; r++) {
    const rowItems = items.slice(cursor, cursor + perRow);
    cursor += perRow;
    const rowTotal = rowItems.reduce((s, b) => s + b.revenue, 0);
    const rowShare = total > 0 ? rowTotal / total : 0;
    const rowH = rowShare * height;
    let xOffset = 0;
    for (const it of rowItems) {
      const share = rowTotal > 0 ? it.revenue / rowTotal : 0;
      const w = share * width;
      cells.push({
        item: it,
        x: xOffset,
        y: cells.length === 0 ? 0 : cells[cells.length - 1].y + (cells[cells.length - 1].y === 0 ? 0 : 0), // placeholder
        w,
        h: rowH,
      });
      xOffset += w;
    }
    // Fix y-coordinates for this row after laying it out.
    const rowStart = cells.length - rowItems.length;
    const y = r === 0 ? 0 : cells[rowStart - 1].y + cells[rowStart - 1].h;
    for (let i = rowStart; i < cells.length; i++) cells[i].y = y;
  }
  return cells;
}
