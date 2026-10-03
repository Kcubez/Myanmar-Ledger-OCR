import { PaginatedTable } from "./PaginatedTable";
import { ApprovalButtons } from "./ApprovalButtons";
import type { ExtractedPayload } from "../lib/persist-ledger";

export function PendingUploadPreview({ id, reportId, date, mode, payload }: {
  id: string; reportId: string; date: string; mode: string; payload: ExtractedPayload;
}) {
  const rows = Array.isArray(payload.lines) ? payload.lines : [];
  const expense = !Array.isArray(payload.lines) && payload.lines && typeof payload.lines === "object"
    ? payload.lines as { header?: Record<string, unknown>; wages?: Record<string, unknown>[] } : null;
  type Column = { key: string; label: string };
  const labels: Record<string, string> = { remark: "Remark", date: "Date", category: "Category", particular: "Particular", in: "In", out: "Out", balance: "Balance", unit: "Unit", method: "Method", name: "Name", amount: "Amount", vehicle: "Vehicle name", part: "Maintenance task" };
  const columnsFor = (keys: string[]): Column[] => keys.map(key => ({ key, label: labels[key] ?? key.replace(/_/g, " ") }));
  const withDate = (items: Record<string, unknown>[]) => items.map(row => ({ ...row, date }));
  const ordered = mode === "inventory" ? ["date", "category", "particular", "in", "out", "balance", "unit", "remark"]
    : mode === "revenue" ? ["date", "method", "amount"]
    : mode === "maintenance" ? ["date", "vehicle", "part", "amount"] : null;
  const sections: { title: string; rows: Record<string, unknown>[]; columns: Column[] }[] = expense
    ? [
      { title: "Expense summary", rows: expense.header ? [{ ...expense.header, date }] : [], columns: columnsFor(["date", "total", "business_drawing", "personal_drawing", "operation"]) },
      { title: "Wages details (included in subtotal when matching)", rows: withDate(expense.wages ?? []), columns: columnsFor(["date", "name", "amount"]) },
    ]
    : [{ title: "Extracted rows", rows: withDate(rows), columns: columnsFor(ordered ?? ["date", ...new Set(rows.flatMap(row => Object.keys(row)).filter(key => key !== "date" && key !== "balance_ok"))]) }];
  return <section className="card pad">
    <h2>{date} · {mode}{mode === "inventory" ? ` · ${payload.sheetKind === "fuel" ? "Fuel" : "Materials"}` : ""}</h2>
    <p className="muted">Pending upload · Approved data stays visible until you approve this upload.</p>
    {!!payload.flags.length && <p role="status">⚠ Review: {payload.flags.join(", ")}</p>}
    {sections.map(section => {
      const columns = section.columns;
      return <div key={section.title}><h3>{section.title}</h3><div className="table-wrap ledger-list">
        <PaginatedTable className="responsive-ledger" role="table"><thead><tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead>
          <tbody>{section.rows.map((row, index) => <tr key={index}>{columns.map(c => <td key={c.key} data-label={c.label}>{row[c.key] === null || row[c.key] === undefined || row[c.key] === "" ? "—" : c.key === "unit" && row[c.key] === "nos" ? "Nos" : String(row[c.key])}</td>)}</tr>)}</tbody>
        </PaginatedTable>
      </div></div>;
    })}
    <p className="muted">If incorrect, reject and resend a clearer photo.</p>
    <ApprovalButtons reportId={reportId} uploadId={id} />
  </section>;
}
