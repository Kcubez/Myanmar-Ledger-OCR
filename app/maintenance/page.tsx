import { ownerPageOrRedirect } from "../../lib/owner-page";
import { prisma } from "../../lib/prisma";
import { parseDateFilter, rangeWhere } from "../../lib/date-filter";
import { AppShell, PageHeader, StatCard } from "../../components/layout";
import { DateFilter } from "../../components/DateFilter";
import { DeleteRowButton } from "../../components/DeleteRowButton";
import { BarChart } from "../../components/charts";

export const dynamic = "force-dynamic";

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await ownerPageOrRedirect();
  const range = parseDateFilter(await searchParams);
  const where = rangeWhere(range);

  // CONFIRMED only — pending reports are reviewed in Approvals first.
  const confirmed = { status: "CONFIRMED" } as const;
  const [byVehicle, recent, entryCount] = await Promise.all([
    prisma.maintenanceLine.groupBy({
      by: ["vehicle"],
      where: { report: { date: where, ...confirmed } },
      _sum: { amount: true },
    }),
    prisma.maintenanceLine.findMany({
      where: { report: { date: where, ...confirmed } },
      orderBy: [{ report: { date: "asc" } }, { id: "asc" }],
      take: 50,
      include: { report: { select: { date: true } } },
    }),
    prisma.maintenanceLine.count({ where: { report: { date: where, ...confirmed } } }),
  ]);

  const totalSpend = byVehicle.reduce((s, row) => s + Number(row._sum.amount ?? 0), 0);

  return (
    <AppShell>
      <PageHeader
        eyebrow="LEDGER DASHBOARD"
        title="Maintenance"
        sub={`${range.label} · spend per vehicle/ship · ${entryCount} lines`}
        actions={<DateFilter />}
      />

      <section className="stats" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }} aria-label="Maintenance totals">
        <StatCard label="Total spend" value={`${Math.round(totalSpend).toLocaleString()} Ks`} tone="bad" />
        <StatCard label="Lines" value={`${entryCount}`} sub={range.label} />
      </section>

      <section className="card pad">
        <h2>Spend per vehicle / ship (Ks)</h2>
        {byVehicle.length ? (
          <BarChart
            data={byVehicle.map((row) => ({ label: row.vehicle || "—", value: Number(row._sum.amount ?? 0) }))}
            color="#a63434"
          />
        ) : (
          <p className="muted">No maintenance lines yet.</p>
        )}
      </section>

      <section className="card pad" style={{ marginTop: 16 }}>
        <h2>Recent lines</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Vehicle / Ship</th>
                <th>Amount</th>
                <th>Part</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((row) => {
                const dateKey = row.report.date.toISOString().slice(0, 10);
                return (
                  <tr key={row.id}>
                    <td>{dateKey}</td>
                    <td>{row.vehicle || "—"}</td>
                    <td>{Number(row.amount).toLocaleString()}</td>
                    <td>{row.part || "—"}</td>
                    <td>
                      <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                        <a href={`/reports/${dateKey}`}>Edit</a>
                        <DeleteRowButton deleteUrl={`/api/maintenance-lines/${row.id}`} label="maintenance line" />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
