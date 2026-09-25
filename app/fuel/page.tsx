import { ownerPageOrRedirect } from "../../lib/owner-page";
import { prisma } from "../../lib/prisma";
import { parseDateFilter, rangeWhere } from "../../lib/date-filter";
import { AppShell, PageHeader, StatCard } from "../../components/layout";
import { DateFilter } from "../../components/DateFilter";
import { DeleteRangeButton } from "../../components/DeleteRangeButton";
import { BarChart } from "../../components/charts";

export const dynamic = "force-dynamic";

export default async function FuelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await ownerPageOrRedirect();
  const range = parseDateFilter(await searchParams);
  const where = rangeWhere(range);

  const [byVehicle, mismatches, recent, entryCount] = await Promise.all([
    prisma.fuelEntry.groupBy({
      by: ["vehicle"],
      where: { report: { date: where } },
      _sum: { inGal: true, outGal: true },
    }),
    prisma.fuelEntry.findMany({
      where: { balanceOk: false, report: { date: where } },
      orderBy: { id: "desc" },
      take: 20,
      include: { report: { select: { date: true } } },
    }),
    prisma.fuelEntry.findMany({
      where: { report: { date: where } },
      orderBy: { id: "desc" },
      take: 30,
      include: { report: { select: { date: true } } },
    }),
    prisma.fuelEntry.count({ where: { report: { date: where } } }),
  ]);

  const totalIn = byVehicle.reduce((s, row) => s + Number(row._sum.inGal ?? 0), 0);
  const totalOut = byVehicle.reduce((s, row) => s + Number(row._sum.outGal ?? 0), 0);

  return (
    <AppShell>
      <PageHeader
        eyebrow="LEDGER DASHBOARD"
        title="Fuel"
        sub={`${range.label} · gallons in/out per vehicle`}
        actions={
          <>
            <DateFilter />
            <DeleteRangeButton
              kind="fuel"
              kindLabel="fuel"
              count={entryCount}
              scopeLabel={range.label}
              gte={range.gte?.toISOString() ?? null}
              lte={range.lte?.toISOString() ?? null}
            />
          </>
        }
      />

      <section className="stats" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }} aria-label="Fuel totals">
        <StatCard label="Total in" value={`${Math.round(totalIn).toLocaleString()} gal`} tone="good" />
        <StatCard label="Total out" value={`${Math.round(totalOut).toLocaleString()} gal`} tone="bad" />
        <StatCard
          label="Balance alerts"
          value={`${mismatches.length}`}
          sub="rows to review"
          tone={mismatches.length ? "bad" : "good"}
        />
      </section>

      <div className="grid-even">
        <section className="card pad">
          <h2>Out per vehicle (gal)</h2>
          {byVehicle.length ? (
            <BarChart
              data={byVehicle.map((row) => ({ label: row.vehicle || "—", value: Number(row._sum.outGal ?? 0) }))}
              color="#c98a2b"
            />
          ) : (
            <p className="muted">No fuel entries yet.</p>
          )}
        </section>
        <section className="card pad">
          <h2>In per vehicle (gal)</h2>
          {byVehicle.length ? (
            <BarChart
              data={byVehicle.map((row) => ({ label: row.vehicle || "—", value: Number(row._sum.inGal ?? 0) }))}
              color="#21633e"
            />
          ) : (
            <p className="muted">No fuel entries yet.</p>
          )}
        </section>
      </div>

      {mismatches.length > 0 && (
        <section className="card pad" style={{ borderColor: "#e5b9b9" }}>
          <h2>⚠️ Balance mismatches ({mismatches.length})</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Vehicle</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {mismatches.map((row) => (
                  <tr key={row.id}>
                    <td>{row.report.date.toISOString().slice(0, 10)}</td>
                    <td>{row.vehicle}</td>
                    <td>{row.inGal?.toString() ?? "—"}</td>
                    <td>{row.outGal?.toString() ?? "—"}</td>
                    <td>{row.balanceGal?.toString() ?? "—"}</td>
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
                <th>Vehicle</th>
                <th>In</th>
                <th>Out</th>
                <th>Balance</th>
                <th>OK</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((row) => (
                <tr key={row.id}>
                  <td>{row.report.date.toISOString().slice(0, 10)}</td>
                  <td>{row.vehicle}</td>
                  <td>{row.inGal?.toString() ?? "—"}</td>
                  <td>{row.outGal?.toString() ?? "—"}</td>
                  <td>{row.balanceGal?.toString() ?? "—"}</td>
                  <td>
                    {row.balanceOk === null || row.balanceOk === undefined ? (
                      "—"
                    ) : row.balanceOk ? (
                      <span className="pill confirmed">OK</span>
                    ) : (
                      <span className="pill review">CHECK</span>
                    )}
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
