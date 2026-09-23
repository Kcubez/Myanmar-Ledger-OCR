import { ownerPageOrRedirect } from "../../lib/owner-page";
import { prisma } from "../../lib/prisma";
import { AppShell, PageHeader, StatCard } from "../../components/layout";
import { BarChart } from "../../components/charts";

export const dynamic = "force-dynamic";

export default async function FuelPage() {
  await ownerPageOrRedirect();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);

  const [byVehicle, mismatches, recent] = await Promise.all([
    prisma.fuelEntry.groupBy({
      by: ["vehicle"],
      where: { report: { date: { gte: since } } },
      _sum: { inGal: true, outGal: true },
    }),
    prisma.fuelEntry.findMany({
      where: { balanceOk: false, report: { date: { gte: since } } },
      orderBy: { id: "desc" },
      take: 20,
      include: { report: { select: { date: true } } },
    }),
    prisma.fuelEntry.findMany({
      where: { report: { date: { gte: since } } },
      orderBy: { id: "desc" },
      take: 30,
      include: { report: { select: { date: true } } },
    }),
  ]);

  const totalIn = byVehicle.reduce((s, row) => s + Number(row._sum.inGal ?? 0), 0);
  const totalOut = byVehicle.reduce((s, row) => s + Number(row._sum.outGal ?? 0), 0);

  return (
    <AppShell>
      <PageHeader eyebrow="LEDGER DASHBOARD" title="Fuel" sub="Last 30 days · gallons in/out per vehicle" />

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
