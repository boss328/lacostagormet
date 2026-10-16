"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ShippingBoxTemplate } from "@/lib/shipping/box-templates";

type Dimensions = Record<"lengthIn" | "widthIn" | "heightIn", string>;
type Editor = Dimensions & { name: string; original: ShippingBoxTemplate | null };

const endpoint = "/api/admin/shipping/box-templates/";
const inputClass =
  "w-full min-h-[44px] border border-rule-strong bg-paper px-3 py-2 text-sm text-ink disabled:opacity-50";
const buttonClass =
  "btn btn-outline min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed";

function dimensionsOf(template: ShippingBoxTemplate): Dimensions {
  return {
    lengthIn: String(template.lengthIn),
    widthIn: String(template.widthIn),
    heightIn: String(template.heightIn),
  };
}

export function BoxTemplatePicker({
  dimensions,
  disabled,
  onApply,
  onBusyChange,
  mode = "shipment",
}: {
  dimensions: Dimensions;
  disabled: boolean;
  onApply: (dimensions: Dimensions) => void;
  onBusyChange: (busy: boolean) => void;
  mode?: "shipment" | "manage";
}) {
  const [templates, setTemplates] = useState<ShippingBoxTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const selected = templates.find((template) => template.id === selectedId);
  const matches = selected &&
    selected.lengthIn === Number(dimensions.lengthIn) &&
    selected.widthIn === Number(dimensions.widthIn) &&
    selected.heightIn === Number(dimensions.heightIn);
  const managing = mode === "manage";
  const current = managing || matches ? selected : undefined;
  const locked = disabled || busy;

  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(endpoint, { cache: "no-store", signal });
    const body = await response.json();
    if (!response.ok) throw new Error(body.errorMessage || body.error || "Could not load saved boxes.");
    setTemplates(body.templates);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "Could not load saved boxes.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [load]);

  async function mutate(method: "POST" | "PATCH" | "DELETE", payload: object) {
    if (lock.current || disabled) return;
    lock.current = true;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409) {
          await load().catch(() => {});
        }
        throw new Error(body.errorMessage || body.error || "Could not save this box. Refresh saved boxes before trying again.");
      }
      if (method === "DELETE") {
        setTemplates((previous) => previous.filter((template) => template.id !== selectedId));
        setSelectedId("");
        setMessage(managing ? "Box template deleted." : "Box template deleted. This package’s dimensions are unchanged.");
      } else {
        const template = body.template as ShippingBoxTemplate;
        setTemplates((previous) => [...previous.filter((item) => item.id !== template.id), template]
          .sort((a, b) => a.name.localeCompare(b.name)));
        setSelectedId(template.id);
        onApply(dimensionsOf(template));
        setMessage(managing ? "Box template saved." : "Box saved and selected. Enter the full packed weight for this shipment.");
      }
      setEditor(null);
      setConfirmDelete(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save this box.");
    } finally {
      lock.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }

  return (
    <div className="mb-5 border border-rule bg-paper p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 text-sm text-ink">
          Saved box
          <select
            className={`${inputClass} mt-2`}
            disabled={locked || loading || !!editor}
            value={current?.id ?? ""}
            onChange={(event) => {
              const template = templates.find((item) => item.id === event.target.value);
              setSelectedId(template?.id ?? "");
              setConfirmDelete(false);
              setMessage(null);
              if (template) onApply(dimensionsOf(template));
            }}
          >
            <option value="">{loading ? "Loading saved boxes…" : managing ? "Choose a saved box" : "Custom dimensions"}</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} · {template.lengthIn} × {template.widthIn} × {template.heightIn} in
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={buttonClass}
          disabled={locked || loading || !!editor}
          onClick={() => {
            setEditor({ name: "", ...(managing ? { lengthIn: "", widthIn: "", heightIn: "" } : dimensions), original: null });
            setConfirmDelete(false);
            setError(null);
            setMessage(null);
          }}
        >New box template</button>
        {current && !editor && (
          <>
            <button type="button" className={buttonClass} disabled={locked} onClick={() => {
              setEditor({ name: current.name, ...dimensionsOf(current), original: current });
              setConfirmDelete(false);
              setError(null);
              setMessage(null);
            }}>Edit box</button>
            <button type="button" className={buttonClass} disabled={locked} onClick={() => setConfirmDelete(true)}>Delete box</button>
          </>
        )}
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        {managing
          ? "Save shared box sizes you use regularly. Dimensions are length × width × height in inches."
          : "Save recurring box sizes for every order. Dimensions are length × width × height in inches; packed weight is entered separately below."}
      </p>
      {!loading && templates.length === 0 && !error && (
        <p className="mt-2 text-sm text-ink-muted">No saved boxes yet. Create a template for a size you use often.</p>
      )}
      {error && (
        <div className="mt-3 text-sm text-accent">
          <p role="alert">{error}</p>
          <button type="button" className={`${buttonClass} mt-2`} disabled={locked} onClick={async () => {
            if (lock.current) return;
            setLoading(true);
            setError(null);
            setEditor(null);
            setConfirmDelete(false);
            try { await load(); } catch (reason) {
              setError(reason instanceof Error ? reason.message : "Could not load saved boxes.");
            } finally { setLoading(false); }
          }}>Refresh saved boxes</button>
          <p className="mt-2 text-xs text-ink-muted">{managing ? "Refresh saved boxes to load the latest templates before making changes." : "You can still enter custom package dimensions below."}</p>
        </div>
      )}
      {message && <p role="status" className="mt-3 text-sm text-ink">{message}</p>}
      {confirmDelete && current && (
        <div className="mt-4 border-t border-rule pt-4">
          <p className="text-sm text-ink">Delete “{current.name}” from saved boxes? Existing shipments keep their dimensions.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={buttonClass} disabled={locked} onClick={() => void mutate("DELETE", { id: current.id, updatedAt: current.updatedAt })}>{busy ? "Deleting…" : "Confirm delete"}</button>
            <button type="button" className={buttonClass} disabled={locked} onClick={() => setConfirmDelete(false)}>Keep box</button>
          </div>
        </div>
      )}
      {editor && (
        <form className="mt-4 border-t border-rule pt-4" onSubmit={(event) => {
          event.preventDefault();
          void mutate(editor.original ? "PATCH" : "POST", {
            ...(editor.original ? { id: editor.original.id, updatedAt: editor.original.updatedAt } : {}),
            name: editor.name,
            lengthIn: Number(editor.lengthIn),
            widthIn: Number(editor.widthIn),
            heightIn: Number(editor.heightIn),
          });
        }}>
          <fieldset disabled={locked}>
            <legend className="mb-3 text-sm font-semibold text-brand-deep">{editor.original ? "Edit box template" : "New box template"}</legend>
            <label className="block text-sm text-ink">Box name
              <input autoFocus required maxLength={80} className={`${inputClass} mt-2`} value={editor.name} placeholder="e.g. Small coffee box" onChange={(event) => setEditor({ ...editor, name: event.target.value })} />
            </label>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {([["lengthIn", "Box length (in)"], ["widthIn", "Box width (in)"], ["heightIn", "Box height (in)"]] as const).map(([key, label]) => (
                <label key={key} className="text-sm text-ink">{label}
                  <input type="number" inputMode="decimal" min="0.01" max="108" step="any" required className={`${inputClass} mt-2`} value={editor[key]} onChange={(event) => setEditor({ ...editor, [key]: event.target.value })} />
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-muted">{managing ? "Measure the outside of the box. These dimensions will be available when preparing future shipments." : "Measure the outside of the box. Changes are saved for future orders and applied to this package."}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="submit" className={buttonClass}>{busy ? "Saving…" : "Save box"}</button>
              <button type="button" className={buttonClass} onClick={() => { setEditor(null); setError(null); }}>Cancel editing</button>
            </div>
          </fieldset>
        </form>
      )}
    </div>
  );
}
