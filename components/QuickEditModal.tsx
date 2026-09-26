"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";

type RevenueRow = { method: string; amount: number };
type ExpenseRow = { category: string; name: string | null; role: string | null; amount: number };
type FuelRow = {
  id: string;
  particular: string | null;
  date: string | null;
  inGal: number | null;
  outGal: number | null;
  balanceGal: number | null;
  balanceOk: boolean | null;
};
type BrickRow = {
  id: string;
  item: string;
  date: string | null;
  qty: number | null;
  unitPrice: number | null;
  amount: number | null;
};
type MaintRow = { id: string; vehicle: string; amount: number; part: string | null };

const num = (value: string): number => (value === "" ? 0 : Number(value) || 0);
const numOrNull = (value: string): number | null => (value === "" ? null : Number(value) || 0);

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span style={{ flex: 1 }}>{label}</span>
      {children}
    </label>
  );
}

const boxStyle = { width: 150, padding: 7, borderRadius: 6, border: "1px solid var(--line)" } as const;

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
 * (add/remove rows) stay in the Approvals queue editor.
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
                    <Field key={row.method} label={METHOD_LABELS[row.method] ?? row.method}>
                      <input
                        value={row.amount}
                        inputMode="numeric"
                        style={boxStyle}
                        onChange={(e) =>
                          setRev((rev ?? []).map((r, j) => (j === i ? { ...r, amount: num(e.target.value) } : r)))
                        }
                      />
                    </Field>
                  ))
                : (exp ?? [])
                    .filter((row) => HEADER_CATS.includes(row.category))
                    .map((row) => (
                      <Field key={row.category} label={row.category.replace(/_/g, " ")}>
                        <input
                          value={row.amount}
                          inputMode="numeric"
                          style={boxStyle}
                          onChange={(e) =>
                            setExp(
                              (exp ?? []).map((r) =>
                                r.category === row.category ? { ...r, amount: num(e.target.value) } : r,
                              ),
                            )
                          }
                        />
                      </Field>
                    ))}
              {kind === "expense" && (
                <p className="muted" style={{ margin: "4px 0 0", fontSize: ".8rem" }}>
                  Wages rows pass through unchanged — edit them in the Approvals queue.
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

/**
 * Per-row edit modal for fuel/brick/maintenance list pages. Loads the day,
 * edits one row by id, PATCHes the full type array back (sibling rows pass
 * through). Structural add/remove stays in the Approvals queue editor.
 */
export function RowEditModal({
  dateKey,
  kind,
  rowId,
}: {
  dateKey: string;
  kind: "fuel" | "brick" | "maintenance";
  rowId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fuel, setFuel] = useState<FuelRow[] | null>(null);
  const [brick, setBrick] = useState<BrickRow[] | null>(null);
  const [maint, setMaint] = useState<MaintRow[] | null>(null);

  async function load() {
    setOpen(true);
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/reports/${dateKey}`);
      if (!response.ok) throw new Error("Load failed.");
      const data = (await response.json()) as {
        report: { fuelEntries: FuelRow[]; brickEntries: BrickRow[]; maintenanceLines: MaintRow[] };
      };
      setFuel(data.report.fuelEntries);
      setBrick(data.report.brickEntries);
      setMaint(data.report.maintenanceLines);
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
      const body =
        kind === "fuel" ? { fuel } : kind === "brick" ? { brick } : { maintenance: maint };
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

  const titles = { fuel: "Edit fuel row", brick: "Edit brick row", maintenance: "Edit maintenance line" } as const;
  const rows = kind === "fuel" ? fuel : kind === "brick" ? brick : maint;
  const row = (rows ?? []).find((r) => r.id === rowId) as FuelRow | BrickRow | MaintRow | undefined;
  const setRow = (patch: Partial<FuelRow> & Partial<BrickRow> & Partial<MaintRow>) => {
    if (kind === "fuel") setFuel((fuel ?? []).map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
    else if (kind === "brick") setBrick((brick ?? []).map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
    else setMaint((maint ?? []).map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
  };

  return (
    <>
      <button type="button" className="secondary" style={{ padding: "4px 10px" }} onClick={load}>
        Edit
      </button>
      <Modal
        open={open}
        title={`${titles[kind]} — ${dateKey}`}
        body={
          loading ? (
            <p className="muted">Loading…</p>
          ) : !row ? (
            <p className="muted">Row no longer exists.</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {error && (
                <span role="alert" style={{ color: "#b3261e", fontSize: ".85rem" }}>
                  {error}
                </span>
              )}
              {kind === "fuel" && (
                <>
                  <Field label="Particular">
                    <input
                      value={(row as FuelRow).particular ?? ""}
                      style={{ ...boxStyle, width: 170 }}
                      onChange={(e) => setRow({ particular: e.target.value })}
                    />
                  </Field>
                  {(["inGal", "outGal", "balanceGal"] as const).map((field) => (
                    <Field key={field} label={field === "inGal" ? "In" : field === "outGal" ? "Out" : "Balance"}>
                      <input
                        value={(row as FuelRow)[field] ?? ""}
                        inputMode="decimal"
                        style={boxStyle}
                        onChange={(e) => setRow({ [field]: numOrNull(e.target.value) })}
                      />
                    </Field>
                  ))}
                </>
              )}
              {kind === "brick" && (
                <>
                  <Field label="Item">
                    <input
                      value={(row as BrickRow).item}
                      style={{ ...boxStyle, width: 170 }}
                      onChange={(e) => setRow({ item: e.target.value })}
                    />
                  </Field>
                  {(["qty", "unitPrice", "amount"] as const).map((field) => (
                    <Field
                      key={field}
                      label={field === "qty" ? "Qty" : field === "unitPrice" ? "Unit price" : "Amount"}
                    >
                      <input
                        value={(row as BrickRow)[field] ?? ""}
                        inputMode="decimal"
                        style={boxStyle}
                        onChange={(e) => setRow({ [field]: numOrNull(e.target.value) })}
                      />
                    </Field>
                  ))}
                </>
              )}
              {kind === "maintenance" && (
                <>
                  <Field label="Vehicle / Ship">
                    <input
                      value={(row as MaintRow).vehicle}
                      style={{ ...boxStyle, width: 170 }}
                      onChange={(e) => setRow({ vehicle: e.target.value })}
                    />
                  </Field>
                  <Field label="Amount">
                    <input
                      value={(row as MaintRow).amount}
                      inputMode="numeric"
                      style={boxStyle}
                      onChange={(e) => setRow({ amount: num(e.target.value) })}
                    />
                  </Field>
                  <Field label="Part">
                    <input
                      value={(row as MaintRow).part ?? ""}
                      style={{ ...boxStyle, width: 170 }}
                      onChange={(e) => setRow({ part: e.target.value })}
                    />
                  </Field>
                </>
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
