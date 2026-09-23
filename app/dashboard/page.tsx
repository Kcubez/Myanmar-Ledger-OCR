import { ownerPageOrRedirect } from "../../lib/owner-page";
import Link from "next/link";
import { prisma } from "../../lib/prisma";
import { AppShell, PageHeader, StatCard, StatusPill } from "../../components/layout";
import { TrendChart, DonutChart, BarChart } from "../../components/charts";

export const dynamic = "force-dynamic";

const dayLabel = (d: Date) => `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;

export default async function DashboardPage() {
  await ownerPageOrRedirect();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);

  const [reports, revenueAgg, expenseAgg, pendingCount] = await Promise.all([
    prisma.dailyReport.findMany({
      where: { date: { gte: since } },
      orderBy: { date: "asc" },
    }),
    prisma.revenueLine.groupBy({
      by: ["method"],
      where: { report: { date: { gte: since } } },
      _sum: { amount: true },
    }),
    prisma.expenseLine.groupBy({
      by: ["category"],
      where: { report: { date: { gte: since } } },
      _sum: { amount: true },
    }),
    prisma.dailyReport.count({ where: { status: { in: ["PENDING", "NEEDS_REVIEW"] } } }),
  ]);

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
    <AppShell>
      <PageHeader
        eyebrow="LEDGER DASHBOARD"
        title="Overview"
        sub="Last 30 days · Telegram-fed reports"
        actions={
          pendingCount > 0 ? (
            <Link href="/approvals">
              <button type="button">Review {pendingCount} pending</button>
            </Link>
          ) : undefined
        }
      />

      <section className="stats" aria-label="Key totals">
        <StatCard label="Revenue" value={`${totalRevenue.toLocaleString()}`} sub="Ks · 30 days" tone="good" />
        <StatCard label="Expense" value={`${totalExpense.toLocaleString()}`} sub="Ks · 30 days" tone="bad" />
        <StatCard
          label="Net"
          value={`${net.toLocaleString()}`}
          sub="Ks · revenue − expense"
          tone={net >= 0 ? "good" : "bad"}
        />
        <StatCard label="Pending" value={`${pendingCount}`} sub="awaiting approval" />
      </section>

      <div className="grid-2">
        <section className="card pad">
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
        <section className="card pad">
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
      </div>

      <section className="card pad" style={{ marginBottom: 16 }}>
        <h2>Expense by category</h2>
        {expenseAgg.length ? (
          <BarChart
            data={expenseAgg.map((row) => ({ label: row.category.replace(/_/g, " "), value: Number(row._sum.amount ?? 0) }))}
            color="#a63434"
          />
        ) : (
          <p className="muted">No expense lines yet.</p>
        )}
      </section>

      <section className="card pad">
        <h2>Recent reports</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Status</th>
                <th>Revenue</th>
                <th>Expense</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reports
                .slice()
                .reverse()
                .slice(0, 14)
                .map((r) => (
                  <tr key={r.id}>
                    <td>{dayLabel(r.date)}</td>
                    <td>
                      <StatusPill status={r.status} />
                    </td>
                    <td>{Number(r.totalRevenue).toLocaleString()}</td>
                    <td>{Number(r.totalExpense).toLocaleString()}</td>
                    <td>
                      <a href={`/reports/${r.date.toISOString().slice(0, 10)}`}>Open</a>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
