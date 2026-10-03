import { LedgerRowActions } from "./LedgerRowActions";
import { PaginatedTable } from "./PaginatedTable";
/** Wages breakdown; edits and deletions recalculate the expense total. */
export function ExpenseWageDetails({ lines }: { lines: { id: string; name: string | null; amount: bigint; report: { date: Date } }[] }) {
  if (!lines.length) return null;
  return (
    <section className="card pad wages-card" style={{ marginTop: 16, marginBottom: 16 }}>
      <div className="table-wrap ledger-list">
          <PaginatedTable searchable title="Wages details" titleMeta={`${lines.length} entries · Included in total expense`} headerActions={<div className="wages-total"><span>Total wages</span><strong>{lines.reduce((sum, line) => sum + line.amount, BigInt(0)).toLocaleString("en-US")} <small>Ks</small></strong></div>} searchPlaceholder="Search name or date…" className="responsive-ledger wages-table" role="table">
            <colgroup><col className="wages-date-col" /><col /><col className="wages-amount-col" /><col className="wages-actions-col" /></colgroup>
            <thead><tr><th scope="col">Date</th><th scope="col">Name</th><th scope="col" className="wages-amount">Amount (Ks)</th><th scope="col">Actions</th></tr></thead>
            <tbody>{lines.map(line => <tr key={line.id}>
              <td data-label="Date">{line.report.date.toISOString().slice(0, 10)}</td>
              <td data-label="Name">{line.name || "—"}</td>
              <td data-label="Amount (Ks)" className="num wages-amount">{line.amount.toLocaleString("en-US")}</td>
              <td data-label="Actions"><LedgerRowActions id={line.id} kind="wage" values={{ name: line.name || "", amount: Number(line.amount) }} /></td>
            </tr>)}</tbody>
          </PaginatedTable>
        </div>
    </section>
  );
}
