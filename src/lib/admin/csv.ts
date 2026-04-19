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
