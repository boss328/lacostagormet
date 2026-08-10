/**
 * Tiny CSV encoder — keeps list-view exports friendly for spreadsheet
 * apps. Quotes every cell + doubles embedded quotes per RFC 4180. UTF-8
 * BOM prefix so Excel on Windows opens the file as UTF-8 rather than
 * interpreting it as Windows-1252.
 */

export function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const lines: string[] = [];
  lines.push(columns.map(csvCell).join(','));
  for (const row of rows) {
    lines.push(columns.map((c) => csvCell(row[c])).join(','));
  }
  // UTF-8 BOM + CRLF for Excel friendliness.
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '""';
  const s = typeof v === 'string' ? v : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export function csvFilename(prefix: string): string {
  const now = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  return `${prefix}-${now}.csv`;
}

/**
 * RFC 4180 parser — the inverse of toCsv, tolerant of what spreadsheet
 * apps hand back: optional BOM, CRLF or LF line ends, quoted cells with
 * embedded commas / quotes / newlines (product descriptions are HTML and
 * contain all three). Returns rows of cells; fully-empty rows dropped.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch; // includes \r\n inside quoted cells
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}
