import { ApprovalButtons } from "./ApprovalButtons";
import type { ExtractedPayload } from "../lib/persist-ledger";

export function PendingUploadPreview({ id, reportId, date, mode, payload }: {
  id: string; reportId: string; date: string; mode: string; payload: ExtractedPayload;
}) {
  const rows = Array.isArray(payload.lines) ? payload.lines : [];
  const expense = !Array.isArray(payload.lines) && payload.lines && typeof payload.lines === "object"
    ? payload.lines as { header?: Record<string, unknown>; wages?: Record<string, unknown>[] } : null;
  const sections: { title: string; rows: Record<string, unknown>[] }[] = expense
    ? [{ title: "Expense summary", rows: expense.header ? [Object.fromEntries(Object.entries(expense.header).filter(([key]) => key !== "wages"))] : [] }, { title: "Labour details (included in subtotal when matching)", rows: expense.wages ?? [] }]
    : [{ title: "Extracted rows", rows }];
  return <section className="card pad">
    <h2>{date} · {mode}{mode === "inventory" ? ` · ${payload.sheetKind === "fuel" ? "Fuel" : "Materials"}` : ""}</h2>
    <p className="muted">Pending upload · Approved data stays visible until you approve this upload.</p>
    <p className="muted">မူရင်းပုံကို Telegram တွင် စစ်ပါ။ အသစ်ကို အတည်ပြုမှ dashboard စာရင်း ပြောင်းပါမည်။</p>
    {!!payload.flags.length && <p role="status">⚠ Review: {payload.flags.join(", ")}</p>}
    {sections.map(section => {
      const columns = [...new Set(section.rows.flatMap(row => Object.keys(row)))];
      return <div key={section.title}><h3>{section.title}</h3><div className="table-wrap ledger-list">
        <table className="responsive-ledger" role="table"><thead><tr>{columns.map(c => <th key={c}>{c.replace(/_/g, " ")}</th>)}</tr></thead>
          <tbody>{section.rows.map((row, index) => <tr key={index}>{columns.map(c => <td key={c} data-label={c.replace(/_/g, " ")}>{row[c] === null || row[c] === undefined || row[c] === "" ? "—" : c === "unit" && row[c] === "nos" ? "Nos" : String(row[c])}</td>)}</tr>)}</tbody>
        </table>
      </div></div>;
    })}
    <p className="muted">If incorrect, reject and resend a clearer photo. / မမှန်လျှင် Reject လုပ်ပြီး ပုံပြန်တင်ပါ။</p>
    <ApprovalButtons reportId={reportId} uploadId={id} />
  </section>;
}
