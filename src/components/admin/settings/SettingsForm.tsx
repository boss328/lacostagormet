'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Settings = {
  autoDraft: boolean;
  replyTo: string;
  signature: string;
  attachCsv: boolean;
};

export function SettingsForm({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [state, setState] = useState<Settings>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      const res = await fetch('/api/admin/settings/vendor-po', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(state),
      });
      if (!res.ok) {
        setMsg({ kind: 'err', text: await res.text() });
        return;
      }
      setMsg({ kind: 'ok', text: 'Saved.' });
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="max-w-[720px]">
      <section
        className="bg-cream"
        style={{ border: '1px solid var(--rule-strong)', padding: '24px 26px' }}
      >
        <p className="type-label text-ink mb-5">§ Vendor PO defaults</p>

        <div className="flex flex-col gap-5">
          <Toggle
            label="Auto-draft POs when an order is paid"
            description="If off, drafts must be created manually from the PO list."
            checked={state.autoDraft}
            onChange={(v) => setState({ ...state, autoDraft: v })}
          />

          <div className="flex flex-col gap-1.5">
            <label className="type-label-sm text-ink" htmlFor="replyTo">
              Reply-to email
            </label>
            <input
              id="replyTo"
              type="email"
              value={state.replyTo}
              onChange={(e) => setState({ ...state, replyTo: e.target.value })}
              placeholder="jeff@lacostagourmet.com"
              className="bg-paper text-ink font-display"
              style={{ border: '1px solid var(--rule-strong)', padding: '9px 14px', fontSize: '14px' }}
            />
            <p className="type-data-mono text-ink-muted">
              Vendor replies route here. Falls back to env REPLY_TO_EMAIL.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="type-label-sm text-ink" htmlFor="signature">
              Default email signature
            </label>
            <textarea
              id="signature"
              rows={4}
              value={state.signature}
              onChange={(e) => setState({ ...state, signature: e.target.value })}
              className="bg-paper text-ink font-mono"
              style={{
                border: '1px solid var(--rule-strong)',
                padding: '10px 14px',
                fontSize: '12.5px',
                lineHeight: 1.55,
              }}
            />
          </div>

          <Toggle
            label="Attach CSV of order items"
            description="Vendor-facing CSV with sku/qty/name. Useful for vendors who key into their own ERP."
            checked={state.attachCsv}
            onChange={(v) => setState({ ...state, attachCsv: v })}
          />
        </div>

        <div className="mt-6 pt-4 flex items-center gap-4" style={{ borderTop: '1px dashed var(--rule)' }}>
          <button
            type="submit"
            disabled={pending}
            className="type-label-sm text-cream"
            style={{ padding: '11px 22px', background: 'var(--color-ink)', opacity: pending ? 0.6 : 1 }}
          >
            {pending ? 'Saving…' : 'Save settings'}
          </button>
          {msg && (
            <span
              className="type-data-mono"
              style={{ color: msg.kind === 'ok' ? 'var(--color-forest)' : 'var(--color-accent)' }}
            >
              {msg.text}
            </span>
          )}
        </div>
      </section>
    </form>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1"
      />
      <span>
        <span className="font-display text-ink" style={{ fontSize: '14.5px' }}>{label}</span>
        <span className="block type-data-mono text-ink-muted mt-1">{description}</span>
      </span>
    </label>
  );
}
