'use client';

import { useRef, useState } from 'react';

type ImportSummary = {
  ok: boolean;
  mode: 'preview' | 'apply';
  total_rows: number;
  matched: number;
  rows_with_changes: number;
  unchanged: number;
  field_counts: Record<string, number>;
  ignored_columns: string[];
  unknown_columns: string[];
  errors: Array<{ line: number; sku: string; message: string }>;
  applied?: number;
  error?: string;
};

/**
 * Upload → preview → confirm client for /api/admin/products/import/.
 * The same file object is posted twice (mode=preview, then mode=apply);
 * the server re-validates from scratch on apply, so the preview is
 * advisory and the apply is the only writing call.
 */
export function ImportProductsCsv() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  async function run(mode: 'preview' | 'apply') {
    if (!file || busy) return;
    setBusy(mode);
    setFatal(null);
    try {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('mode', mode);
      const res = await fetch('/api/admin/products/import/', { method: 'POST', body: fd });
      const body = (await res.json().catch(() => null)) as ImportSummary | null;
      if (!body) {
        setFatal(`Server returned ${res.status} with no readable body.`);
        setResult(null);
      } else {
        setResult(body);
        if (body.error && !body.errors?.length) setFatal(body.error);
      }
    } catch (e) {
      setFatal(e instanceof Error ? e.message : 'Request failed.');
      setResult(null);
    } finally {
      setBusy(null);
    }
  }

  const applied = result?.mode === 'apply' && result.ok;
  const canApply =
    Boolean(file) &&
    !busy &&
    result?.mode === 'preview' &&
    result.ok &&
    result.rows_with_changes > 0;

  return (
    <div className="max-w-[840px] flex flex-col gap-8">
      {/* File picker */}
      <div className="flex items-center gap-5 flex-wrap">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="type-data-mono text-ink"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
            setFatal(null);
          }}
        />
        <button
          type="button"
          className="btn btn-solid"
          style={{ padding: '10px 18px', fontSize: '12px' }}
          disabled={!file || busy !== null}
          onClick={() => run('preview')}
        >
          {busy === 'preview' ? 'Checking…' : 'Preview changes'}
        </button>
      </div>

      {fatal && (
        <p className="type-data-mono" style={{ color: 'var(--color-error, #a33)' }}>
          {fatal}
        </p>
      )}

      {result && (
        <section
          className="flex flex-col gap-5 p-6"
          style={{ border: '1px solid var(--rule-strong)' }}
        >
          <p className="type-label text-accent">
            § {applied ? 'Import complete' : 'Preview'}
          </p>

          <dl className="type-data-mono text-ink flex flex-col gap-1">
            <Row label="Data rows in file" value={result.total_rows} />
            <Row label="Matched products" value={result.matched} />
            <Row
              label={applied ? 'Rows updated' : 'Rows with changes'}
              value={applied ? result.applied ?? 0 : result.rows_with_changes}
            />
            <Row label="Rows unchanged" value={result.unchanged} />
          </dl>

          {Object.keys(result.field_counts).length > 0 && (
            <div>
              <p className="type-label-sm text-ink-muted mb-2">Changes by field</p>
              <dl className="type-data-mono text-ink flex flex-col gap-1">
                {Object.entries(result.field_counts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([field, n]) => (
                    <Row key={field} label={field} value={n} />
                  ))}
              </dl>
            </div>
          )}

          {result.ignored_columns.length > 0 && (
            <p className="type-data-mono text-ink-muted">
              Ignored (never importable): {result.ignored_columns.join(', ')}
            </p>
          )}
          {result.unknown_columns.length > 0 && (
            <p className="type-data-mono text-ink-muted">
              Unrecognized columns (skipped): {result.unknown_columns.join(', ')}
            </p>
          )}

          {result.errors.length > 0 && (
            <div>
              <p className="type-label-sm mb-2" style={{ color: 'var(--color-error, #a33)' }}>
                {result.errors.length} row error{result.errors.length === 1 ? '' : 's'} — fix
                these and re-upload; nothing can be applied while any remain
              </p>
              <ul className="type-data-mono flex flex-col gap-1" style={{ color: 'var(--color-error, #a33)' }}>
                {result.errors.map((e, i) => (
                  <li key={i}>
                    line {e.line}
                    {e.sku ? ` · ${e.sku}` : ''} — {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!applied && result.ok && result.rows_with_changes === 0 && (
            <p className="type-data-mono text-ink-muted">
              File is valid but changes nothing.
            </p>
          )}

          {canApply && (
            <div className="pt-2" style={{ borderTop: '1px solid var(--rule)' }}>
              <button
                type="button"
                className="btn btn-solid"
                style={{ padding: '10px 18px', fontSize: '12px' }}
                disabled={busy !== null}
                onClick={() => run('apply')}
              >
                {busy === 'apply'
                  ? 'Applying…'
                  : `Confirm — update ${result.rows_with_changes} product${result.rows_with_changes === 1 ? '' : 's'}`}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-6 max-w-[360px]">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right">{value.toLocaleString()}</dd>
    </div>
  );
}
