import { ownerPageOrRedirect } from "../../lib/owner-page";
import { prisma } from "../../lib/prisma";
import { AppShell, PageHeader, StatCard } from "../../components/layout";
import { BarChart } from "../../components/charts";

export const dynamic = "force-dynamic";

export default async function BrickPage() {
  await ownerPageOrRedirect();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);

  const [byItem, lowConfidence, recent] = await Promise.all([
    prisma.brickEntry.groupBy({
      by: ["item"],
      where: { report: { date: { gte: since } } },
      _sum: { amount: true, qty: true },
    }),
    prisma.brickEntry.findMany({
      where: { report: { date: { gte: since } }, OR: [{ confidence: { lt: 0.5 } }, { confidence: null }] },
      orderBy: { id: "desc" },
      take: 20,
      include: { report: { select: { date: true } } },
    }),
    prisma.brickEntry.findMany({
      where: { report: { date: { gte: since } } },
      orderBy: { id: "desc" },
      take: 30,
      include: { report: { select: { date: true } } },
    }),
  ]);

  const totalAmount = byItem.reduce((s, row) => s + Number(row._sum.amount ?? 0), 0);
  const totalQty = byItem.reduce((s, row) => s + Number(row._sum.qty ?? 0), 0);

  return (
    <AppShell>
      <PageHeader eyebrow="LEDGER DASHBOARD" title="Brick" sub="Last 30 days · quantity & amount by item" />

      <section className="stats" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }} aria-label="Brick totals">
        <StatCard label="Total amount" value={`${Math.round(totalAmount).toLocaleString()} Ks`} tone="good" />
        <StatCard label="Total qty" value={`${Math.round(totalQty).toLocaleString()}`} />
        <StatCard
          label="Needs review"
          value={`${lowConfidence.length}`}
          sub="low-confidence rows"
          tone={lowConfidence.length ? "bad" : "good"}
        />
      </section>

      <section className="card pad" style={{ marginBottom: 16 }}>
        <h2>Amount by item (Ks)</h2>
        {byItem.length ? (
          <BarChart data={byItem.map((row) => ({ label: row.item || "—", value: Number(row._sum.amount ?? 0) }))} />
        ) : (
          <p className="muted">No brick entries yet.</p>
        )}
      </section>

      {lowConfidence.length > 0 && (
        <section className="card pad" style={{ borderColor: "#e5b9b9" }}>
          <h2>⚠️ Low-confidence rows ({lowConfidence.length}) — review in daily report</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {lowConfidence.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <a href={`/reports/${row.report.date.toISOString().slice(0, 10)}`}>
                        {row.report.date.toISOString().slice(0, 10)}
                      </a>
                    </td>
                    <td>{row.item}</td>
                    <td>{row.qty?.toString() ?? "—"}</td>
                    <td>{row.amount?.toString() ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card pad" style={{ marginTop: 16 }}>
        <h2>Recent entries</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Item</th>
                <th>Qty</th>
                <th>Unit price</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((row) => (
                <tr key={row.id}>
                  <td>{row.report.date.toISOString().slice(0, 10)}</td>
                  <td>{row.item}</td>
                  <td>{row.qty?.toString() ?? "—"}</td>
                  <td>{row.unitPrice?.toString() ?? "—"}</td>
                  <td>{row.amount?.toString() ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
