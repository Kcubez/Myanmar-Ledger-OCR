"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type EditableReport = {
  status: string;
  revenueLines: { method: string; amount: number }[];
  expenseLines: { category: string; name: string | null; role: string | null; amount: number }[];
  maintenanceLines: { vehicle: string; amount: number; part: string | null; vendor: string | null }[];
  fuelEntries: {
    vehicle: string;
    particular: string | null;
    inGal: number | null;
    outGal: number | null;
    balanceGal: number | null;
    balanceOk: boolean | null;
  }[];
  brickEntries: { item: string; qty: number | null; unitPrice: number | null; amount: number | null }[];
};

const inputStyle = {
  width: "100%",
  border: "1px solid transparent",
  padding: 7,
  borderRadius: 6,
  background: "transparent",
} as const;

export function ReportEditor({ dateKey, initial }: { dateKey: string; initial: EditableReport }) {
  const router = useRouter();
  const [report, setReport] = useState<EditableReport>(initial);
  const [status, setStatus] = useState(initial.status);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const setRows = <K extends keyof EditableReport>(key: K, rows: EditableReport[K]) =>
    setReport((current) => ({ ...current, [key]: rows }));

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/reports/${dateKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          revenue: report.revenueLines,
          expense: report.expenseLines,
          maintenance: report.maintenanceLines,
          fuel: report.fuelEntries,
          brick: report.brickEntries,
        }),
      });
      if (!response.ok) throw new Error((await response.json()).message ?? "Save failed.");
      setMessage("Saved — totals recalculated.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="editor-actions" style={{ marginBottom: 14 }}>
        <label className="muted">
          Status{" "}
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: 8, borderRadius: 8 }}>
            <option value="PENDING">PENDING</option>
            <option value="CONFIRMED">CONFIRMED</option>
            <option value="NEEDS_REVIEW">NEEDS_REVIEW</option>
          </select>
        </label>
        <button type="button" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        {message && (
          <span className="status" role="status" style={{ width: "auto" }}>
            {message}
          </span>
        )}
      </div>

      {report.revenueLines.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <h2>Revenue</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {report.revenueLines.map((row, i) => (
                  <tr key={i}>
                    <td>{row.method}</td>
                    <td>
                      <input
                        style={inputStyle}
                        value={row.amount}
                        onChange={(e) =>
                          setRows(
                            "revenueLines",
                            report.revenueLines.map((r, j) => (j === i ? { ...r, amount: Number(e.target.value) || 0 } : r)),
                          )
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="delete"
                        aria-label="Remove row"
                        onClick={() => setRows("revenueLines", report.revenueLines.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {report.expenseLines.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <h2>Expense</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Name</th>
                  <th>Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {report.expenseLines.map((row, i) => (
                  <tr key={i}>
                    <td>{row.category}</td>
                    <td>
                      <input
                        style={inputStyle}
                        value={row.name ?? ""}
                        onChange={(e) =>
                          setRows(
                            "expenseLines",
                            report.expenseLines.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        style={inputStyle}
                        value={row.amount}
                        onChange={(e) =>
                          setRows(
                            "expenseLines",
                            report.expenseLines.map((r, j) => (j === i ? { ...r, amount: Number(e.target.value) || 0 } : r)),
                          )
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="delete"
                        aria-label="Remove row"
                        onClick={() => setRows("expenseLines", report.expenseLines.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {report.maintenanceLines.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <h2>Maintenance</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Part</th>
                  <th>Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {report.maintenanceLines.map((row, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        style={inputStyle}
                        value={row.vehicle}
                        onChange={(e) =>
                          setRows(
                            "maintenanceLines",
                            report.maintenanceLines.map((r, j) => (j === i ? { ...r, vehicle: e.target.value } : r)),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        style={inputStyle}
                        value={row.part ?? ""}
                        onChange={(e) =>
                          setRows(
                            "maintenanceLines",
                            report.maintenanceLines.map((r, j) => (j === i ? { ...r, part: e.target.value } : r)),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        style={inputStyle}
                        value={row.amount}
                        onChange={(e) =>
                          setRows(
                            "maintenanceLines",
                            report.maintenanceLines.map((r, j) => (j === i ? { ...r, amount: Number(e.target.value) || 0 } : r)),
                          )
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="delete"
                        aria-label="Remove row"
                        onClick={() => setRows("maintenanceLines", report.maintenanceLines.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {report.fuelEntries.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <h2>Fuel (gal)</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Balance</th>
                  <th>OK</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {report.fuelEntries.map((row, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        style={inputStyle}
                        value={row.vehicle}
                        onChange={(e) =>
                          setRows(
                            "fuelEntries",
                            report.fuelEntries.map((r, j) => (j === i ? { ...r, vehicle: e.target.value } : r)),
                          )
                        }
                      />
                    </td>
                    {(
                      [
                        ["inGal", row.inGal],
                        ["outGal", row.outGal],
                        ["balanceGal", row.balanceGal],
                      ] as const
                    ).map(([field, value]) => (
                      <td key={field}>
                        <input
                          style={inputStyle}
                          value={value ?? ""}
                          onChange={(e) =>
                            setRows(
                              "fuelEntries",
                              report.fuelEntries.map((r, j) =>
                                j === i ? { ...r, [field]: e.target.value === "" ? null : Number(e.target.value) || 0 } : r,
                              ),
                            )
                          }
                        />
                      </td>
                    ))}
                    <td>{row.balanceOk === null ? "—" : row.balanceOk ? "✓" : "✗"}</td>
                    <td>
                      <button
                        type="button"
                        className="delete"
                        aria-label="Remove row"
                        onClick={() => setRows("fuelEntries", report.fuelEntries.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {report.brickEntries.length > 0 && (
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
                  <th />
                </tr>
              </thead>
              <tbody>
                {report.brickEntries.map((row, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        style={inputStyle}
                        value={row.item}
                        onChange={(e) =>
                          setRows(
                            "brickEntries",
                            report.brickEntries.map((r, j) => (j === i ? { ...r, item: e.target.value } : r)),
                          )
                        }
                      />
                    </td>
                    {(
                      [
                        ["qty", row.qty],
                        ["unitPrice", row.unitPrice],
                        ["amount", row.amount],
                      ] as const
                    ).map(([field, value]) => (
                      <td key={field}>
                        <input
                          style={inputStyle}
                          value={value ?? ""}
                          onChange={(e) =>
                            setRows(
                              "brickEntries",
                              report.brickEntries.map((r, j) =>
                                j === i ? { ...r, [field]: e.target.value === "" ? null : Number(e.target.value) || 0 } : r,
                              ),
                            )
                          }
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        type="button"
                        className="delete"
                        aria-label="Remove row"
                        onClick={() => setRows("brickEntries", report.brickEntries.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
