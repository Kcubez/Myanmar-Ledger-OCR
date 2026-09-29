/** Read-only labour breakdown; these amounts are already included in expense totals. */
export function ExpenseWageDetails({ lines }: { lines: { id: string; name: string | null; amount: bigint; report: { date: Date } }[] }) {
  if (!lines.length) return null;
  return (
    <section className="card pad" style={{ marginTop: 16, marginBottom: 16 }}>
      <h2>Labour details / လုပ်အားခ အသေးစိတ်</h2>
      <p className="muted">Included in total expense · စုစုပေါင်းထွက်ငွေထဲတွင် ပါဝင်ပြီးဖြစ်သည်။</p>
      <details>
        <summary style={{ cursor: "pointer", padding: "12px 0" }}>
          {lines.length} entries · {lines.reduce((sum, line) => sum + line.amount, BigInt(0)).toLocaleString("en-US")} Ks — View details
        </summary>
        <div className="table-wrap ledger-list">
          <table className="responsive-ledger" role="table">
            <thead><tr><th scope="col">Date</th><th scope="col">Person / Vehicle / Role</th><th scope="col">Amount (Ks)</th></tr></thead>
            <tbody>{lines.map(line => <tr key={line.id}>
              <td data-label="Date">{line.report.date.toISOString().slice(0, 10)}</td>
              <td data-label="Person / Vehicle / Role">{line.name || "—"}</td>
              <td data-label="Amount (Ks)" className="num">{line.amount.toLocaleString("en-US")}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
