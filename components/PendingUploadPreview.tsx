"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDMY } from "../lib/format";
import { ApprovalButtons } from "./ApprovalButtons";
import { useToast } from "./ToastProvider";
import type { ExtractedPayload } from "../lib/persist-ledger";

type Row = Record<string, unknown>;
type Section = { id: "rows" | "header" | "wages"; title: string; rows: Row[]; keys: string[]; removable: boolean };
const labels: Record<string, string> = { category: "Category", particular: "Particular", in: "In", out: "Out", balance: "Balance", unit: "Unit", remark: "Remark", method: "Method", amount: "Amount", vehicle: "Vehicle", part: "Maintenance task", total: "Total", business_drawing: "Business drawing", personal_drawing: "Personal drawing", operation: "Operation", name: "Name" };
const title = (key: string) => labels[key] ?? key.replace(/_/g, " ");
const clone = (value: ExtractedPayload) => JSON.parse(JSON.stringify(value)) as ExtractedPayload;
function SaveIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h11l3 3v15H5zM8 3v6h8V3M8 21v-7h8v7" /></svg>; }
function CloseIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>; }
function TrashIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" /></svg>; }

export function PendingUploadPreview({ id, reportId, date: initialDate, mode, payload: initialPayload }: { id: string; reportId: string; date: string; mode: string; payload: ExtractedPayload }) {
  const router = useRouter();
  const toast = useToast();
  const [payload, setPayload] = useState(() => clone(initialPayload));
  const [date, setDate] = useState(initialDate);
  const [savedPayload, setSavedPayload] = useState(() => clone(initialPayload));
  const [savedDate, setSavedDate] = useState(initialDate);
  const [editing, setEditing] = useState<{ section: Section["id"]; row: number; key: string; value: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = date !== savedDate || JSON.stringify(payload) !== JSON.stringify(savedPayload);
  const sections = useMemo<Section[]>(() => {
    if (!Array.isArray(payload.lines)) {
      const expense = payload.lines as { header?: Row; wages?: Row[] };
      return [
        { id: "header", title: "Expense summary", rows: expense.header ? [expense.header] : [], keys: ["total", "business_drawing", "personal_drawing", "operation"], removable: false },
        { id: "wages", title: "Wage details", rows: expense.wages ?? [], keys: ["name", "amount"], removable: true },
      ];
    }
    const keys = mode === "inventory" ? ["category", "particular", "in", "out", "balance", "unit", "remark"]
      : mode === "revenue" ? ["method", "amount"]
      : mode === "maintenance" ? ["vehicle", "part", "amount"]
      : Array.from(new Set(payload.lines.flatMap(row => Object.keys(row as Row))));
    return [{ id: "rows", title: "Extracted rows", rows: payload.lines as Row[], keys, removable: true }];
  }, [mode, payload.lines]);

  function changeRows(section: Section["id"], update: (rows: Row[]) => Row[]) {
    setPayload(current => {
      const next = clone(current);
      if (Array.isArray(next.lines)) next.lines = update(next.lines as Row[]);
      else {
        const expense = next.lines as { header?: Row; wages?: Row[] };
        if (section === "header") expense.header = update(expense.header ? [expense.header] : [])[0] ?? {};
        if (section === "wages") expense.wages = update(expense.wages ?? []);
      }
      return next;
    });
  }
  function commitCell() {
    if (!editing) return;
    changeRows(editing.section, rows => rows.map((row, index) => index === editing.row ? { ...row, [editing.key]: editing.value } : row));
    setEditing(null);
  }
  async function save() {
    setSaving(true);
    try {
      const response = await fetch(`/api/pending-uploads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, payload }) });
      const data = await response.json() as { message?: string };
      if (!response.ok) throw new Error(data.message ?? "Unable to save corrections.");
      setSavedPayload(clone(payload));
      setSavedDate(date);
      toast.success("Pending corrections saved. Approve when ready.");
      router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to save corrections."); }
    finally { setSaving(false); }
  }

  return <section className="card pad">
    <h2>{formatDMY(date)} · {mode}{mode === "inventory" ? ` · ${payload.sheetKind === "fuel" ? "Fuel" : "Materials"}` : ""}</h2>
    <p className="muted">Edit/delete only changes this pending extraction. Live dashboard data changes only after approval.</p>
    <label className="pending-date"><span><small>Source photo</small>Photo date</span><input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
    {!!payload.flags.length && <p role="status">⚠ Review: {payload.flags.join(", ")}</p>}
    {sections.map(section => <div key={section.id}><h3>{section.title}</h3><div className="table-wrap ledger-list pending-editor">
      <table className="responsive-ledger pending-table"><thead><tr>{section.keys.map(key => <th key={key}>{title(key)}</th>)}<th className="actions">Actions</th></tr></thead><tbody>
        {section.rows.map((row, rowIndex) => <tr key={rowIndex}>{section.keys.map(key => {
          const active = editing?.section === section.id && editing.row === rowIndex && editing.key === key;
          return <td key={key} data-label={title(key)} onDoubleClick={() => setEditing({ section: section.id, row: rowIndex, key, value: String(row[key] ?? "") })}>
            {active ? <span className="inline-cell-edit"><input autoFocus value={editing.value} onChange={event => setEditing({ ...editing, value: event.target.value })} onKeyDown={event => { if (event.key === "Enter") commitCell(); if (event.key === "Escape") setEditing(null); }} /><button type="button" className="icon-save" onClick={commitCell} aria-label="Save cell" title="Save cell"><SaveIcon /></button><button type="button" className="icon-cancel" onClick={() => setEditing(null)} aria-label="Cancel cell edit" title="Cancel edit"><CloseIcon /></button></span> : <button type="button" className="cell-value" onClick={() => setEditing({ section: section.id, row: rowIndex, key, value: String(row[key] ?? "") })}>{row[key] === null || row[key] === undefined || row[key] === "" ? "—" : String(row[key])}</button>}
          </td>;
        })}<td className="actions" data-label="Actions">{section.removable && <button type="button" className="icon-delete" aria-label="Delete row" title="Delete row" onClick={() => changeRows(section.id, rows => rows.filter((_, index) => index !== rowIndex))}><TrashIcon /></button>}</td></tr>)}
      </tbody></table>
    </div></div>)}
    <div className="pending-actions"><button type="button" className="discard-button" disabled={!dirty || saving} onClick={() => { setPayload(clone(savedPayload)); setDate(savedDate); setEditing(null); }}>Discard</button><button type="button" className="save-corrections-button" disabled={!dirty || saving} onClick={save}>{saving ? "Saving…" : "Save corrections"}</button></div>
    {dirty && <p className="muted">Save corrections before approving this upload.</p>}
    <ApprovalButtons reportId={reportId} uploadId={id} disabled={dirty || saving} />
  </section>;
}
