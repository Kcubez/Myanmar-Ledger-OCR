"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { DeleteRowButton } from "./DeleteRowButton";
import { useToast } from "./ToastProvider";

type Values = { particular: string; remark: string; quantityIn: number | null; quantityOut: number | null; balance: number | null } | { name: string; amount: number };
export function LedgerRowActions({ id, kind, values, revision, dateKey, submissionId }: { id: string; kind: "inventory" | "wage"; values: Values; revision: string; dateKey?: string; submissionId?: string | null }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const router = useRouter();
  const toast = useToast();
  const url = `/api/${kind === "inventory" ? "inventory-entries" : "wage-lines"}/${id}`;
  const labels: Record<string, string> = { reportDate: "Date", particular: "Particular", remark: "Remark", quantityIn: "In", quantityOut: "Out", balance: "Balance", name: "Name", amount: "Amount (Ks)" };
  async function save() {
    setBusy(true);
    try {
      if (kind === "inventory" && dateKey && draft.reportDate !== dateKey) {
        if (!submissionId) throw new Error("This older entry cannot be moved individually. Open its source upload first.");
        const move = await fetch(`/api/ledger-submissions/${submissionId}/date`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: draft.reportDate }) });
        if (!move.ok) throw new Error((await move.json()).message || "Date change failed.");
        setOpen(false); toast.success("Date changed. Reopen this editor to change values."); router.refresh(); return;
      }
      const data: Record<string, string | number | null> = { expectedRevision: revision };
      for (const [key, value] of Object.entries(draft)) data[key] = ["quantityIn", "quantityOut", "balance", "amount"].includes(key) ? (value.trim() === "" ? null : Number(value)) : value;
      const response = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!response.ok) throw new Error((await response.json()).message || "Save failed.");
      setOpen(false); toast.success("Changes saved."); router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Save failed."); }
    finally { setBusy(false); }
  }
  return <span className="row-actions">
    <button className="row-action" type="button" onClick={() => { setDraft({ ...(kind === "inventory" && dateKey ? { reportDate: dateKey } : {}), ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === null ? "" : String(value)])) }); setOpen(true); }}>Edit</button>
    <DeleteRowButton deleteUrl={url} label={kind === "wage" ? "wages row" : "inventory row"} expectedRevision={revision} />
    <Modal open={open} title={kind === "wage" ? "Edit wages" : "Edit inventory"} busy={busy} confirmLabel="Save changes" onConfirm={save} onCancel={() => { if (!busy) setOpen(false); }} body={<div className="row-edit-fields">
      {Object.entries(draft).map(([key, value]) => <label key={key}>{labels[key]}{key === "remark" ? <textarea rows={3} maxLength={2000} value={value} onChange={e => setDraft({ ...draft, [key]: e.target.value })} /> : <input type={key === "reportDate" ? "date" : ["particular", "name"].includes(key) ? "text" : "number"} min={key === "reportDate" ? undefined : "0"} step={key === "amount" ? "1" : "0.001"} maxLength={500} value={value} onChange={e => setDraft({ ...draft, [key]: e.target.value })} />}</label>)}
      {kind === "inventory" && <p className="muted">Blank quantities stay blank. Editing or deleting a movement checks fuel balances without changing recorded balances.</p>}
    </div>} />
  </span>;
}
