"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";

type RevenueRow = { method: string; amount: number };
type ExpenseRow = { category: string; name: string | null; role: string | null; amount: number };

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  KBZ_PAY: "KBZ Pay",
  MMQR: "MMQR",
  KBZ_SPECIAL: "KBZ Special",
  AYA_SPECIAL: "AYA Special",
};

const HEADER_CATS = ["BUSINESS_DRAWING", "PERSONAL_DRAWING", "OPERATION"];

/**
 * Inline number-fix modal for revenue/expense daily rows. Loads the day's
 * current lines, edits amounts, PATCHes the full type array back (untouched
 * rows — e.g. wages — pass through unchanged). Structural changes
 * (add/remove rows) stay in the report page editor.
 */
export function QuickEditModal({ dateKey, kind }: { dateKey: string; kind: "revenue" | "expense" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [rev, setRev] = useState<RevenueRow[] | null>(null);
  const [exp, setExp] = useState<ExpenseRow[] | null>(null);

  async function load() {
    setOpen(true);
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/reports/${dateKey}`);
      if (!response.ok) throw new Error("Load failed.");
      const data = (await response.json()) as {
        report: { revenueLines: RevenueRow[]; expenseLines: ExpenseRow[] };
      };
      setRev(data.report.revenueLines);
      setExp(data.report.expenseLines);
    } catch {
      setError("Load failed.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const body = kind === "revenue" ? { revenue: rev } : { expense: exp };
      const response = await fetch(`/api/reports/${dateKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("Save failed.");
      setOpen(false);
      router.refresh();
    } catch {
      setError("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const num = (value: string): number => (value === "" ? 0 : Number(value) || 0);

  return (
    <>
      <button type="button" className="secondary" style={{ padding: "4px 10px" }} onClick={load}>
        Edit
      </button>
      <Modal
        open={open}
        title={kind === "revenue" ? `Edit revenue — ${dateKey}` : `Edit expense — ${dateKey}`}
        body={
          loading ? (
            <p className="muted">Loading…</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {error && (
                <span role="alert" style={{ color: "#b3261e", fontSize: ".85rem" }}>
                  {error}
                </span>
              )}
              {kind === "revenue"
                ? (rev ?? []).map((row, i) => (
                    <label key={row.method} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ flex: 1 }}>{METHOD_LABELS[row.method] ?? row.method}</span>
                      <input
                        value={row.amount}
                        inputMode="numeric"
                        style={{ width: 140, padding: 7, borderRadius: 6, border: "1px solid var(--line)" }}
                        onChange={(e) =>
                          setRev((rev ?? []).map((r, j) => (j === i ? { ...r, amount: num(e.target.value) } : r)))
                        }
                      />
                    </label>
                  ))
                : (exp ?? [])
                    .filter((row) => HEADER_CATS.includes(row.category))
                    .map((row) => (
                      <label key={row.category} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ flex: 1 }}>{row.category.replace(/_/g, " ")}</span>
                        <input
                          value={row.amount}
                          inputMode="numeric"
                          style={{ width: 140, padding: 7, borderRadius: 6, border: "1px solid var(--line)" }}
                          onChange={(e) =>
                            setExp(
                              (exp ?? []).map((r) =>
                                r.category === row.category ? { ...r, amount: num(e.target.value) } : r,
                              ),
                            )
                          }
                        />
                      </label>
                    ))}
              {kind === "expense" && (
                <p className="muted" style={{ margin: "4px 0 0", fontSize: ".8rem" }}>
                  Wages rows pass through unchanged — edit them in the report page.
                </p>
              )}
            </div>
          )
        }
        confirmLabel={saving ? "Saving…" : "Save"}
        busy={saving}
        onConfirm={save}
        onCancel={() => {
          if (!saving) setOpen(false);
        }}
      />
    </>
  );
}
