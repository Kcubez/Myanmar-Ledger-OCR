import { ownerPageOrRedirect } from "../../lib/owner-page";
import { prisma } from "../../lib/prisma";
import { parseDateFilter, rangeWhere } from "../../lib/date-filter";
import { AppShell, PageHeader, StatCard } from "../../components/layout";
import { DateFilter } from "../../components/DateFilter";
import { DeleteRangeButton } from "../../components/DeleteRangeButton";
import { BarChart } from "../../components/charts";

export const dynamic = "force-dynamic";

export default async function BrickPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await ownerPageOrRedirect();
  const range = parseDateFilter(await searchParams);
  const where = rangeWhere(range);

  const [byItem, lowConfidence, recent, entryCount] = await Promise.all([
    prisma.brickEntry.groupBy({
      by: ["item"],
      where: { report: { date: where } },
      _sum: { amount: true, qty: true },
    }),
    prisma.brickEntry.findMany({
      where: { report: { date: where }, OR: [{ confidence: { lt: 0.5 } }, { confidence: null }] },
      orderBy: { id: "desc" },
      take: 20,
      include: { report: { select: { date: true } } },
    }),
    prisma.brickEntry.findMany({
      where: { report: { date: where } },
      orderBy: { id: "desc" },
      take: 30,
      include: { report: { select: { date: true } } },
    }),
    prisma.brickEntry.count({ where: { report: { date: where } } }),
  ]);

  const totalAmount = byItem.reduce((s, row) => s + Number(row._sum.amount ?? 0), 0);
  const totalQty = byItem.reduce((s, row) => s + Number(row._sum.qty ?? 0), 0);

  return (
    <AppShell>
      <PageHeader
        eyebrow="LEDGER DASHBOARD"
        title="Brick"
        sub={`${range.label} · quantity & amount by item`}
        actions={
          <>
            <DateFilter />
            <DeleteRangeButton
              kind="brick"
              kindLabel="brick"
              count={entryCount}
              scopeLabel={range.label}
              gte={range.gte?.toISOString() ?? null}
              lte={range.lte?.toISOString() ?? null}
            />
          </>
        }
      />

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
