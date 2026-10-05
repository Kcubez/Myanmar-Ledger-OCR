import { entryPage } from "../../../lib/ledger-listing";
import { tableRequest } from "../../../lib/table-page";
import { retryRead } from "../../../lib/read-retry";
import { formatDMY } from "../../../lib/format";
import { PaginatedTable } from "../../../components/PaginatedTable";
import { ownerPageOrRedirect } from "../../../lib/owner-page";
import { prisma } from "../../../lib/prisma";
import { parseDateFilter, rangeWhere } from "../../../lib/date-filter";
import { PageHeader, StatCard } from "../../../components/layout";
import { DeleteRangeButton } from "../../../components/DeleteRangeButton";
import { DateFilter } from "../../../components/DateFilter";
import { DeleteRowButton } from "../../../components/DeleteRowButton";
import { RowEditModal } from "../../../components/QuickEditModal";
import { DonutChart } from "../../../components/charts";

export const dynamic = "force-dynamic";

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await ownerPageOrRedirect();
  const params = await searchParams;
  const range = parseDateFilter(params);
  const where = rangeWhere(range);

  // CONFIRMED only — pending reports are reviewed in Approvals first.
  const confirmed = { status: "CONFIRMED" } as const;
  const listing = await retryRead(() => entryPage("maintenance", range, tableRequest(params)));
  const [byVehicle, recent, entryCount] = await retryRead(() => prisma.$transaction([
    prisma.maintenanceLine.groupBy({
      by: ["vehicle"],
      where: { report: { date: where, ...confirmed } },
      _sum: { amount: true },
    }),
    prisma.maintenanceLine.findMany({
      where: { id: { in: listing.ids }, report: { date: where, ...confirmed } },
      orderBy: [{ report: { date: "desc" } }, { id: "asc" }],

      include: { report: { select: { date: true } } },
    }),
    prisma.maintenanceLine.count({ where: { report: { date: where, ...confirmed } } }),
  ]));

  const totalSpend = byVehicle.reduce((s, row) => s + Number(row._sum.amount ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Maintenance"
        sub={`${range.label} · spend per vehicle`}
        actions={<><DateFilter /><DeleteRangeButton kind="maintenance" kindLabel="maintenance" count={entryCount} scopeLabel={range.label} gte={range.gte?.toISOString() ?? null} lte={range.lte?.toISOString() ?? null} /></>}
      />

      <section className="stats stats-2" aria-label="Maintenance totals">
        <StatCard label="Total spend" value={`${Math.round(totalSpend).toLocaleString()} Ks`} sub={`${entryCount} lines · ${range.label}`} tone="bad" icon="wrench" />
        <StatCard label="Lines" value={`${entryCount}`} sub={range.label} icon="list" />
      </section>

      <section className="card pad">
        <h2>Spend per vehicle (Ks)</h2>
        {byVehicle.length ? (
          <DonutChart
            slices={byVehicle.map((row) => ({ label: row.vehicle || "—", value: Number(row._sum.amount ?? 0) }))}
            totalLabel="Total spend"
            centerLabel="vehicles"
          />
        ) : (
          <p className="chart-empty">No maintenance lines yet.</p>
        )}
      </section>

      <section className="card pad" style={{ marginTop: 16 }}>
        <div className="table-wrap ledger-list">
          <PaginatedTable pagination={{ page: listing.page, total: listing.total, query: listing.query }} searchable title="Recent lines" searchPlaceholder="Search vehicle, task, or date…" className="responsive-ledger" role="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Vehicle name</th>
                <th>Maintenance task</th>
                <th className="num">Amount</th>
                <th className="actions">Action</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((row) => {
                const dateKey = row.report.date.toISOString().slice(0, 10);
                return (
                  <tr key={row.id}>
                    <td data-label="Date" data-iso={dateKey}>{formatDMY(dateKey)}</td>
                    <td data-label="Vehicle name">{row.vehicle || "—"}</td>
                    <td data-label="Maintenance task">{row.part || "—"}</td>
                    <td data-label="Amount" className="num">{Number(row.amount).toLocaleString()}</td>
                    <td data-label="Action" className="actions">
                      <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                        <RowEditModal dateKey={dateKey} kind="maintenance" rowId={row.id} />
                        <DeleteRowButton deleteUrl={`/api/maintenance-lines/${row.id}`} label="maintenance line" />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </PaginatedTable>
        </div>
      </section>
    </>
  );
}
