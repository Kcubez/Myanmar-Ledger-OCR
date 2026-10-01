import { ownerPageOrRedirect } from "../../../lib/owner-page";
import { prisma } from "../../../lib/prisma";
import { parseDateFilter, rangeWhere, entryDateWhere } from "../../../lib/date-filter";
import { PageHeader, StatCard } from "../../../components/layout";
import { DateFilter } from "../../../components/DateFilter";
import { DeleteRangeButton } from "../../../components/DeleteRangeButton";
import { DeleteRowButton } from "../../../components/DeleteRowButton";
import { RowEditModal } from "../../../components/QuickEditModal";
import { BarChart } from "../../../components/charts";

export const dynamic = "force-dynamic";

export default async function FuelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await ownerPageOrRedirect();
  const range = parseDateFilter(await searchParams);
  const where = rangeWhere(range);

  // CONFIRMED only — pending reports are reviewed in Approvals first.
  const confirmed = { status: "CONFIRMED" } as const;
  const entryWhere = { ...entryDateWhere(where), report: confirmed };
  const [byParticular, mismatches, recent, entryCount] = await Promise.all([
    prisma.fuelEntry.groupBy({
      by: ["particular"],
      where: { ...entryWhere },
      _sum: { inGal: true, outGal: true },
    }),
    prisma.fuelEntry.findMany({
      where: { balanceOk: false, ...entryWhere },
      orderBy: { id: "desc" },
      take: 20,
      include: { report: { select: { date: true } } },
    }),
    prisma.fuelEntry.findMany({
      where: { ...entryWhere },
      orderBy: { id: "asc" },
      take: 30,
      include: { report: { select: { date: true } } },
    }),
    prisma.fuelEntry.count({ where: { ...entryWhere } }),
  ]);

  const totalIn = byParticular.reduce((s, row) => s + Number(row._sum.inGal ?? 0), 0);
  const totalOut = byParticular.reduce((s, row) => s + Number(row._sum.outGal ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Legacy Fuel"
        sub={`${range.label} · gallons in/out per particular`}
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
          <h2>Out per particular (gal)</h2>
          {byParticular.length ? (
            <BarChart
              data={byParticular.map((row) => ({ label: row.particular || "—", value: Number(row._sum.outGal ?? 0) }))}
              color="#c98a2b"
            />
          ) : (
            <p className="muted">No fuel entries yet.</p>
          )}
        </section>
        <section className="card pad">
          <h2>In per particular (gal)</h2>
          {byParticular.length ? (
            <BarChart
              data={byParticular.map((row) => ({ label: row.particular || "—", value: Number(row._sum.inGal ?? 0) }))}
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
          <div className="table-wrap ledger-list">
            <table className="responsive-ledger" role="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Particular</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {mismatches.map((row) => (
                  <tr key={row.id}>
                    <td data-label="Date">{(row.date ?? row.report.date).toISOString().slice(0, 10)}</td>
                    <td data-label="Particular">{row.particular || row.vehicle || "—"}</td>
                    <td data-label="In">{row.inGal?.toString() ?? "—"}</td>
                    <td data-label="Out">{row.outGal?.toString() ?? "—"}</td>
                    <td data-label="Balance">{row.balanceGal?.toString() ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card pad" style={{ marginTop: 16 }}>
        <h2>Recent entries</h2>
        <div className="table-wrap ledger-list">
          <table className="responsive-ledger" role="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Particular</th>
                <th>In</th>
                <th>Out</th>
                <th>Balance</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((row) => {
                const dateKey = (row.date ?? row.report.date).toISOString().slice(0, 10);
                return (
                  <tr key={row.id}>
                    <td data-label="Date">{dateKey}</td>
                    <td data-label="Particular">{row.particular || row.vehicle || "—"}</td>
                    <td data-label="In">{row.inGal?.toString() ?? "—"}</td>
                    <td data-label="Out">{row.outGal?.toString() ?? "—"}</td>
                    <td data-label="Balance">{row.balanceGal?.toString() ?? "—"}</td>
                    <td data-label="Action">
                      <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                        <RowEditModal dateKey={row.report.date.toISOString().slice(0, 10)} kind="fuel" rowId={row.id} />
                        <DeleteRowButton deleteUrl={`/api/fuel-entries/${row.id}`} label="fuel entry" />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
