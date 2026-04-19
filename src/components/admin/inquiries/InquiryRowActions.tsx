'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Status = 'new' | 'contacted' | 'archived';

const NEXT_FOR: Partial<Record<Status, Array<{ to: Status; label: string }>>> = {
  new:       [{ to: 'contacted', label: 'Mark contacted' }, { to: 'archived', label: 'Archive' }],
  contacted: [{ to: 'archived', label: 'Archive' }],
  archived:  [{ to: 'new', label: 'Reopen' }],
};

export function InquiryRowActions({ id, status }: { id: string; status: Status }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function setStatus(next: Status) {
    setErr(null);
    start(async () => {
      const fd = new FormData();
      fd.append('status', next);
      const res = await fetch(`/api/admin/inquiries/${id}/status`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        setErr(await res.text());
        return;
      }
      router.refresh();
    });
  }

  const choices = NEXT_FOR[status] ?? [];

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        {choices.map((c) => (
          <button
            key={c.to}
            type="button"
            onClick={() => setStatus(c.to)}
            disabled={pending}
            className="type-label-sm text-ink"
            style={{
              padding: '6px 12px',
              border: '1px solid var(--color-ink)',
              background: 'var(--color-cream)',
              opacity: pending ? 0.6 : 1,
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
      {err && <p className="type-data-mono text-accent">{err}</p>}
    </div>
  );
}
