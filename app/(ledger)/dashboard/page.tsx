import { ExpenseWageDetails } from "../../../components/ExpenseWageDetails";
import { ownerPageOrRedirect } from "../../../lib/owner-page";
import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { parseDateFilter, rangeWhere } from "../../../lib/date-filter";
import { PageHeader, StatCard, StatusPill } from "../../../components/layout";
import { DateFilter } from "../../../components/DateFilter";
import { TrendChart, DonutChart, BarChart } from "../../../components/charts";

export const dynamic = "force-dynamic";

const dayLabel = (d: Date) => `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await ownerPageOrRedirect();
  const range = parseDateFilter(await searchParams);
  const where = rangeWhere(range);

  // Dashboards show CONFIRMED data only — PENDING/NEEDS_REVIEW reports live
  // in Approvals until reviewed. The pending card + review button below are
  // the pointer there.
  const confirmed = { status: "CONFIRMED" } as const;
  const [reportRows, revenueAgg, expenseAgg, pendingCount, wageLines] = await Promise.all([
    prisma.dailyReport.findMany({
      where: { date: where, ...confirmed },
      orderBy: { date: "asc" },
      include: {
        _count: {
          select: { revenueLines: true, expenseLines: true, maintenanceLines: true, fuelEntries: true, brickEntries: true },
        },
      },
    }),
    prisma.revenueLine.groupBy({
      by: ["method"],
      where: { report: { date: where, ...confirmed } },
      _sum: { amount: true },
    }),
    prisma.expenseLine.groupBy({
      by: ["category"],
      where: { report: { date: where, ...confirmed } },
      _sum: { amount: true },
    }),
    prisma.dailyReport.count({ where: { status: { in: ["PENDING", "NEEDS_REVIEW"] } } }),
    prisma.expenseLine.findMany({
      where: { category: "WAGES", report: { date: where, ...confirmed } },
      include: { report: { select: { date: true } } },
      orderBy: [{ report: { date: "desc" } }, { id: "asc" }],
    }),
  ]);

  // Days whose lines were all deleted vanish from the dashboard (stats,
  // trend, and Recent table stay consistent — one filtered array).
  const reports = reportRows.filter((report) => {
    const counts = report._count;
    return (
      counts.revenueLines + counts.expenseLines + counts.maintenanceLines + counts.fuelEntries + counts.brickEntries > 0
    );
  });
  const totalRevenue = reports.reduce((s, r) => s + Number(r.totalRevenue), 0);
  const totalExpense = reports.reduce((s, r) => s + Number(r.totalExpense), 0);
  const net = totalRevenue - totalExpense;

  const METHOD_LABELS: Record<string, string> = {
    CASH: "Cash",
    KBZ_PAY: "KBZ Pay",
    MMQR: "MMQR",
    KBZ_SPECIAL: "KBZ Special",
    AYA_SPECIAL: "AYA Special",
  };

  return (
    <>
      <PageHeader
        title="Overview"
        sub={`${range.label}`}
        actions={
          <>
            <DateFilter />
            {pendingCount > 0 && (
              <Link href="/approvals">
                <button type="button">Review {pendingCount} pending</button>
              </Link>
            )}
          </>
        }
      />

      <section className="stats" aria-label="Key totals">
        <StatCard label="Revenue" value={`${totalRevenue.toLocaleString()}`} sub={`Ks · ${range.label}`} tone="good" />
        <StatCard label="Expense" value={`${totalExpense.toLocaleString()}`} sub={`Ks · ${range.label}`} tone="bad" />
        <StatCard
          label="Net"
          value={`${net.toLocaleString()}`}
          sub="Ks · revenue − expense"
          tone={net >= 0 ? "good" : "bad"}
        />
        {pendingCount > 0 ? (
          <Link href="/approvals" className="stat-link" aria-label={`Review ${pendingCount} pending reports`}>
            <StatCard label="Pending" value={`${pendingCount}`} sub="awaiting approval — tap to review" tone="warn" />
          </Link>
        ) : (
          <StatCard label="Pending" value="0" sub="all caught up" />
        )}
      </section>

      <div className="dashboard-charts">
        <section className="card pad dashboard-trend">
          <p className="section-eyebrow">Trend</p>
          <h2>Revenue vs expense</h2>
          {reports.length ? (
            <TrendChart
              data={reports.map((r) => ({
                label: dayLabel(r.date),
                a: Number(r.totalRevenue),
                b: Number(r.totalExpense),
              }))}
            />
          ) : (
            <p className="muted">No reports yet — submit photos via Telegram.</p>
          )}
        </section>
        <section className="card pad dashboard-payment">
          <p className="section-eyebrow">Mix</p>
          <h2>Revenue by payment</h2>
          {revenueAgg.length ? (
            <DonutChart
              slices={revenueAgg.map((row) => ({
                label: METHOD_LABELS[row.method] ?? row.method,
                value: Number(row._sum.amount ?? 0),
              }))}
            />
          ) : (
            <p className="muted">No revenue lines yet.</p>
          )}
        </section>

      <section className="card pad dashboard-expense">
        <p className="section-eyebrow">Breakdown</p>
        <h2>Expense by category</h2>
        <p className="chart-meta">Amount · Ks · Highest first</p>
        {expenseAgg.length ? (
          <BarChart
            data={expenseAgg.map((row) => ({ label: row.category.replace(/_/g, " "), value: Number(row._sum.amount ?? 0) }))}
            color="#a63434"
          />
        ) : (
          <p className="muted">No expense lines yet.</p>
        )}
      </section>

      </div>

      <ExpenseWageDetails lines={wageLines} />

      <section className="card pad">
        <p className="section-eyebrow">History</p>
        <h2>Recent reports</h2>
        <div className="table-wrap ledger-list">
          <table className="responsive-ledger" role="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Status</th>
                <th className="num">Revenue</th>
                <th className="num">Expense</th>
              </tr>
            </thead>
            <tbody>
              {reports
                .slice()
                .reverse()
                .slice(0, 14)
                .map((r) => (
                  <tr key={r.id}>
                    <td data-label="Date">{dayLabel(r.date)}</td>
                    <td data-label="Status">
                      <StatusPill status={r.status} />
                    </td>
                    <td data-label="Revenue" className="num">{Number(r.totalRevenue).toLocaleString()}</td>
                    <td data-label="Expense" className="num">{Number(r.totalExpense).toLocaleString()}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
