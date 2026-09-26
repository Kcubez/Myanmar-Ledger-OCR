"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { RowEditModal } from "./QuickEditModal";

export type EditableReport = {
  status: string;
  revenueLines: { id: string; method: string; amount: number }[];
  expenseLines: { id: string; category: string; name: string | null; amount: number }[];
  maintenanceLines: { id: string; vehicle: string; amount: number; part: string | null }[];
  fuelEntries: {
    id: string;
    particular: string | null;
    date: string | null; // round-tripped hidden; PATCH falls back to page date
    inGal: number | null;
    outGal: number | null;
    balanceGal: number | null;
    balanceOk: boolean | null;
  }[];
  brickEntries: {
    id: string;
    item: string;
    date: string | null;
    qty: number | null;
    unitPrice: number | null;
    amount: number | null;
  }[];
};

type Kind = "revenue" | "expense" | "maintenance" | "fuel" | "brick";

/**
 * Read-only ledger tables with per-row Edit (modal, immediate save) and
 * Delete (immediate PATCH-minus-row + refresh). No drafts, no bulk save —
 * every action persists at once. Rendered from props so router.refresh()
 * always shows fresh server data.
 */
export function ReportEditor({ dateKey, initial }: { dateKey: string; initial: EditableReport }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ kind: Kind; id: string; label: string } | null>(null);
  const [error, setError] = useState("");

  const arrays: Record<Kind, { id: string }[]> = {
    revenue: initial.revenueLines,
    expense: initial.expenseLines,
    maintenance: initial.maintenanceLines,
    fuel: initial.fuelEntries,
    brick: initial.brickEntries,
  };

  async function removeRow(kind: Kind, id: string) {
    setBusyId(id);
    setError("");
    try {
      const kept = (arrays[kind] as Record<string, unknown>[]).filter((row) => row.id !== id);
      const response = await fetch(`/api/reports/${dateKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [kind]: kept }),
      });
      if (!response.ok) throw new Error("Delete failed.");
      setConfirming(null);
      router.refresh();
    } catch {
      setError("Delete failed.");
    } finally {
      setBusyId(null);
    }
  }

  const fmt = (value: number | null) => (value === null ? "—" : value.toLocaleString());

  return (
    <div>
      {error && (
        <p role="alert" className="auth-error" style={{ marginBottom: 12 }}>
          {error}
        </p>
      )}

      {initial.revenueLines.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <h2>Revenue</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <b>Total</b>
                  </td>
                  <td>
                    <b>{initial.revenueLines.reduce((s, r) => s + r.amount, 0).toLocaleString()}</b>
                  </td>
                  <td />
                </tr>
                {initial.revenueLines.map((row) => (
                  <tr key={row.id}>
                    <td>{row.method}</td>
                    <td>{row.amount.toLocaleString()}</td>
                    <td>
                      <RowActions
                        dateKey={dateKey}
                        kind="revenue"
                        rowId={row.id}
                        label={row.method}
                        busy={busyId === row.id}
                        onDelete={() => setConfirming({ kind: "revenue", id: row.id, label: row.method })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {initial.expenseLines.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <h2>Expense</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Name</th>
                  <th>Amount</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <b>Total</b>
                  </td>
                  <td />
                  <td>
                    <b>{initial.expenseLines.reduce((s, r) => s + r.amount, 0).toLocaleString()}</b>
                  </td>
                  <td />
                </tr>
                {initial.expenseLines.map((row) => (
                  <tr key={row.id}>
                    <td>{row.category}</td>
                    <td>{row.name ?? "—"}</td>
                    <td>{row.amount.toLocaleString()}</td>
                    <td>
                      <RowActions
                        dateKey={dateKey}
                        kind={row.category === "WAGES" ? "wage" : "expense"}
                        rowId={row.id}
                        label={row.name ?? row.category}
                        busy={busyId === row.id}
                        onDelete={() => setConfirming({ kind: "expense", id: row.id, label: row.name ?? row.category })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {initial.maintenanceLines.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <h2>Maintenance</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Vehicle / Ship</th>
                  <th>Part</th>
                  <th>Amount</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {initial.maintenanceLines.map((row) => (
                  <tr key={row.id}>
                    <td>{row.vehicle}</td>
                    <td>{row.part ?? "—"}</td>
                    <td>{row.amount.toLocaleString()}</td>
                    <td>
                      <RowActions
                        dateKey={dateKey}
                        kind="maintenance"
                        rowId={row.id}
                        label={row.vehicle}
                        busy={busyId === row.id}
                        onDelete={() => setConfirming({ kind: "maintenance", id: row.id, label: row.vehicle })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {initial.fuelEntries.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <h2>Fuel (gal)</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Particular</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Balance</th>
                  <th>OK</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {initial.fuelEntries.map((row) => (
                  <tr key={row.id}>
                    <td>{row.particular ?? "—"}</td>
                    <td>{row.inGal?.toString() ?? "—"}</td>
                    <td>{row.outGal?.toString() ?? "—"}</td>
                    <td>{row.balanceGal?.toString() ?? "—"}</td>
                    <td>{row.balanceOk === null ? "—" : row.balanceOk ? "✓" : "✗"}</td>
                    <td>
                      <RowActions
                        dateKey={dateKey}
                        kind="fuel"
                        rowId={row.id}
                        label={row.particular ?? "fuel entry"}
                        busy={busyId === row.id}
                        onDelete={() => setConfirming({ kind: "fuel", id: row.id, label: row.particular ?? "fuel entry" })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {initial.brickEntries.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <h2>Brick</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Unit price</th>
                  <th>Amount</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {initial.brickEntries.map((row) => (
                  <tr key={row.id}>
                    <td>{row.item}</td>
                    <td>{row.qty?.toString() ?? "—"}</td>
                    <td>{fmt(row.unitPrice)}</td>
                    <td>{fmt(row.amount)}</td>
                    <td>
                      <RowActions
                        dateKey={dateKey}
                        kind="brick"
                        rowId={row.id}
                        label={row.item}
                        busy={busyId === row.id}
                        onDelete={() => setConfirming({ kind: "brick", id: row.id, label: row.item })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Modal
        open={confirming !== null}
        title={`Delete ${confirming?.label ?? "row"}?`}
        body="This cannot be undone. Source photos are kept."
        confirmLabel="Delete"
        danger
        busy={busyId !== null}
        onConfirm={() => {
          if (confirming) void removeRow(confirming.kind, confirming.id);
        }}
        onCancel={() => {
          if (busyId === null) setConfirming(null);
        }}
      />
    </div>
  );
}

function RowActions({
  dateKey,
  kind,
  rowId,
  label,
  busy,
  onDelete,
}: {
  dateKey: string;
  kind: "revenue" | "expense" | "wage" | "maintenance" | "fuel" | "brick";
  rowId: string;
  label: string;
  busy: boolean;
  onDelete: () => void;
}) {
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <RowEditModal dateKey={dateKey} kind={kind} rowId={rowId} />
      <button
        type="button"
        className="delete"
        aria-label={`Delete ${label}`}
        disabled={busy}
        onClick={onDelete}
      >
        ×
      </button>
    </span>
  );
}
