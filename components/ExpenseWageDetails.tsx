import type { TablePage } from "../lib/table-page";
import { LedgerRowActions } from "./LedgerRowActions";
import { formatDMY } from "../lib/format";
import { PaginatedTable } from "./PaginatedTable";
import { wageRowRevision } from "../lib/row-revision";
/** Wages breakdown; edits and deletions recalculate the expense total. */
export function ExpenseWageDetails({ lines, pagination }: { pagination?: TablePage; lines: { id: string; reportId: string; category: string; name: string | null; amount: bigint; report: { date: Date } }[] }) {
  if (!lines.length && !pagination) return null;
  return (
    <section className="card pad wages-card" style={{ marginTop: 16, marginBottom: 16 }}>
      <div className="table-wrap ledger-list">
          <PaginatedTable pagination={pagination} searchable title="Wages details" searchPlaceholder="Search name or date…" className="responsive-ledger wages-table" role="table">
            <colgroup><col className="wages-date-col" /><col /><col className="wages-amount-col" /><col className="wages-actions-col" /></colgroup>
            <thead><tr><th scope="col">Date</th><th scope="col">Name</th><th scope="col" className="wages-amount">Amount (Ks)</th><th scope="col" className="actions">Actions</th></tr></thead>
            <tbody>{lines.map(line => <tr key={line.id}>
              <td data-label="Date" data-iso={line.report.date.toISOString().slice(0, 10)}>{formatDMY(line.report.date.toISOString().slice(0, 10))}</td>
              <td data-label="Name">{line.name || "—"}</td>
              <td data-label="Amount (Ks)" className="num wages-amount">{line.amount.toLocaleString("en-US")}</td>
              <td data-label="Actions" className="actions"><LedgerRowActions id={line.id} kind="wage" revision={wageRowRevision(line)} values={{ name: line.name || "", amount: Number(line.amount) }} /></td>
            </tr>)}</tbody>
          </PaginatedTable>
        </div>
    </section>
  );
}
