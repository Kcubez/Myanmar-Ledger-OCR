import { dailyPage } from "../../../lib/ledger-listing";
import { tableRequest } from "../../../lib/table-page";
import { retryRead } from "../../../lib/read-retry";
import { formatDMY } from "../../../lib/format";
import { PaginatedTable } from "../../../components/PaginatedTable";
import { ownerPageOrRedirect } from "../../../lib/owner-page";
import { prisma } from "../../../lib/prisma";
import { parseDateFilter, rangeWhere } from "../../../lib/date-filter";
import { PageHeader, StatCard } from "../../../components/layout";
import { DateFilter } from "../../../components/DateFilter";
import { DeleteRangeButton } from "../../../components/DeleteRangeButton";
import { QuickEditModal } from "../../../components/QuickEditModal";
import { DonutChart } from "../../../components/charts";

export const dynamic = "force-dynamic";

const METHODS = ["CASH", "KBZ_PAY", "MMQR", "KBZ_SPECIAL", "AYA_SPECIAL"] as const;
const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  KBZ_PAY: "KBZ Pay",
  MMQR: "MMQR",
  KBZ_SPECIAL: "KBZ Special",
  AYA_SPECIAL: "AYA Special",
};

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const nextDay = (key: string) => new Date(new Date(`${key}T00:00:00.000Z`).getTime() + 86400000);

export default async function RevenuePage({
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
  const [aggregates, lineCount, dayCount] = await retryRead(() => prisma.$transaction([
    prisma.revenueLine.groupBy({ by: ["method"], where: { report: { date: where, ...confirmed } }, _sum: { amount: true }, _count: true }),
    prisma.revenueLine.count({ where: { report: { date: where, ...confirmed } } }),
    prisma.dailyReport.count({ where: { date: where, ...confirmed, revenueLines: { some: {} } } }),
  ]));
  const listing = await retryRead(() => dailyPage("revenue", range, tableRequest(params)));
  const days = listing.rows.map(row => [dayKey(row.date), { total: Number(row.total), methods: row.values, count: row.count, wages: row.wages }] as const);
  const total = aggregates.reduce((sum, row) => sum + Number(row._sum.amount ?? 0), 0);
  const byMethod = METHODS.map(method => ({ label: METHOD_LABELS[method], value: Number(aggregates.find(row => row.method === method)?._sum.amount ?? 0) })).filter(row => row.value > 0);

  return (
    <>
      <PageHeader
        title="Revenue"
        sub={`${range.label} · daily payment split`}
        actions={
          <>
            <DateFilter />
            <DeleteRangeButton
              kind="revenue"
              kindLabel="revenue"
              count={lineCount}
              scopeLabel={range.label}
              gte={range.gte?.toISOString() ?? null}
              lte={range.lte?.toISOString() ?? null}
            />
          </>
        }
      />

      <section className="stats" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }} aria-label="Revenue totals">
        <StatCard label="Total revenue" value={`${Math.round(total).toLocaleString()} Ks`} sub={`${dayCount} days · ${range.label}`} tone="good" icon="trend-up" />
        <StatCard label="Days" value={`${dayCount}`} sub={range.label} icon="calendar" />
      </section>

      <section className="card pad">
        <h2>Revenue by payment</h2>
        {byMethod.length ? (
          <DonutChart slices={byMethod} />
        ) : (
          <p className="chart-empty">No revenue lines yet.</p>
        )}
      </section>

      <section className="card pad" style={{ marginTop: 16 }}>
        <div className="table-wrap ledger-list">
          <PaginatedTable pagination={{ page: listing.page, total: listing.total, query: listing.query }} searchable title="Daily revenue" searchPlaceholder="Search date or amount…" className="responsive-ledger" role="table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="num">Total</th>
                <th className="num">Cash</th>
                <th className="num">KBZ Pay</th>
                <th className="num">MMQR</th>
                <th className="num">KBZ Sp</th>
                <th className="num">AYA Sp</th>
                <th className="actions">Action</th>
              </tr>
            </thead>
            <tbody>
              {days.map(([key, day]) => (
                <tr key={key}>
                  <td data-label="Date" data-iso={key}>{formatDMY(key)}</td>
                  <td data-label="Total" className="num">{Math.round(day.total).toLocaleString()}</td>
                  <td data-label="Cash" className="num">{Math.round(day.methods.CASH ?? 0).toLocaleString()}</td>
                  <td data-label="KBZ Pay" className="num">{Math.round(day.methods.KBZ_PAY ?? 0).toLocaleString()}</td>
                  <td data-label="MMQR" className="num">{Math.round(day.methods.MMQR ?? 0).toLocaleString()}</td>
                  <td data-label="KBZ Sp" className="num">{Math.round(day.methods.KBZ_SPECIAL ?? 0).toLocaleString()}</td>
                  <td data-label="AYA Sp" className="num">{Math.round(day.methods.AYA_SPECIAL ?? 0).toLocaleString()}</td>
                  <td data-label="Action" className="actions">
                    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                      <QuickEditModal dateKey={key} kind="revenue" />
                      <DeleteRangeButton inline
                        kind="revenue"
                        kindLabel="revenue"
                        count={day.count}
                        scopeLabel={key}
                        gte={new Date(`${key}T00:00:00.000Z`).toISOString()}
                        lte={nextDay(key).toISOString()}
                      />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </PaginatedTable>
        </div>
      </section>
    </>
  );
}
