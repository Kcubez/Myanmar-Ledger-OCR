import { dailyPage, entryPage } from "../../../lib/ledger-listing";
import { tableRequest } from "../../../lib/table-page";
import { retryRead } from "../../../lib/read-retry";
import { formatDMY } from "../../../lib/format";
import { PaginatedTable } from "../../../components/PaginatedTable";
import { ExpenseWageDetails } from "../../../components/ExpenseWageDetails";
import { ownerPageOrRedirect } from "../../../lib/owner-page";
import { prisma } from "../../../lib/prisma";
import { parseDateFilter, rangeWhere } from "../../../lib/date-filter";
import { PageHeader, StatCard } from "../../../components/layout";
import { DateFilter } from "../../../components/DateFilter";
import { DeleteRangeButton } from "../../../components/DeleteRangeButton";
import { QuickEditModal } from "../../../components/QuickEditModal";
import { BarChart } from "../../../components/charts";

export const dynamic = "force-dynamic";

const CATEGORIES = ["BUSINESS_DRAWING", "PERSONAL_DRAWING", "OPERATION", "WAGES"] as const;

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const nextDay = (key: string) => new Date(new Date(`${key}T00:00:00.000Z`).getTime() + 86400000);

export default async function ExpensePage({
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
    prisma.expenseLine.groupBy({ by: ["category"], where: { report: { date: where, ...confirmed } }, _sum: { amount: true }, _count: true }),
    prisma.expenseLine.count({ where: { report: { date: where, ...confirmed } } }),
    prisma.dailyReport.count({ where: { date: where, ...confirmed, expenseLines: { some: {} } } }),
  ]));
  const listing = await retryRead(() => dailyPage("expense", range, tableRequest(params)));
  const days = listing.rows.map(row => [dayKey(row.date), { total: Number(row.total), cats: row.values, count: row.count, wages: row.wages }] as const);
  const total = aggregates.reduce((sum, row) => sum + Number(row._sum.amount ?? 0), 0);
  const wageListing = await retryRead(() => entryPage("wage", range, tableRequest(params, "wage")));
  const wages = await prisma.expenseLine.findMany({ where: { id: { in: wageListing.ids } }, include: { report: { select: { date: true } } }, orderBy: [{ report: { date: "desc" } }, { id: "asc" }] });
  const wageAggregate = aggregates.find(row => row.category === "WAGES");
  const totalWages = Number(wageAggregate?._sum.amount ?? 0);
  const wageRows = wageAggregate?._count ?? 0;
  const byCategory = CATEGORIES.map(cat => ({ label: cat.replace(/_/g, " "), value: Number(aggregates.find(row => row.category === cat)?._sum.amount ?? 0) })).filter(row => row.value > 0);

  return (
    <>
      <PageHeader
        title="Expense"
        sub={`${range.label} · daily OPEX split`}
        actions={
          <>
            <DateFilter />
            <DeleteRangeButton
              kind="expense"
              kindLabel="expense"
              count={lineCount}
              scopeLabel={range.label}
              gte={range.gte?.toISOString() ?? null}
              lte={range.lte?.toISOString() ?? null}
            />
          </>
        }
      />

      <section className="stats stats-3" aria-label="Expense totals">
        <StatCard label="Total expense" value={`${Math.round(total).toLocaleString()} Ks`} sub={`${dayCount} days · ${range.label}`} tone="bad" icon="trend-down" />
        <StatCard label="Total wages" value={`${Math.round(totalWages).toLocaleString()} Ks`} sub={`${wageRows} rows · ${range.label}`} icon="clock" />
        <StatCard label="Days" value={`${dayCount}`} sub={range.label} icon="calendar" />
      </section>

      <section className="card pad">
        <h2>Expense by category</h2>
        {byCategory.length ? (
          <BarChart data={byCategory} color="#a63434" />
        ) : (
          <p className="chart-empty">No expense lines yet.</p>
        )}
      </section>

      <section className="card pad" style={{ marginTop: 16 }}>
        <div className="table-wrap ledger-list">
          <PaginatedTable pagination={{ page: listing.page, total: listing.total, query: listing.query }} searchable title="Daily expense" searchPlaceholder="Search date or amount…" className="responsive-ledger" role="table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="num">Total</th>
                <th className="num">Business</th>
                <th className="num">Personal</th>
                <th className="num">Operation</th>
                <th className="num">Wages</th>
                <th className="actions">Action</th>
              </tr>
            </thead>
            <tbody>
              {days.map(([key, day]) => (
                <tr key={key}>
                  <td data-label="Date" data-iso={key}>{formatDMY(key)}</td>
                  <td data-label="Total" className="num">{Math.round(day.total).toLocaleString()}</td>
                  <td data-label="Business" className="num">{Math.round(day.cats.BUSINESS_DRAWING ?? 0).toLocaleString()}</td>
                  <td data-label="Personal" className="num">{Math.round(day.cats.PERSONAL_DRAWING ?? 0).toLocaleString()}</td>
                  <td data-label="Operation" className="num">{Math.round(day.cats.OPERATION ?? 0).toLocaleString()}</td>
                  <td data-label="Wages" className="num">{day.wages === 0 ? "—" : `${day.wages} rows · ${Math.round(day.cats.WAGES ?? 0).toLocaleString()}`}</td>
                  <td data-label="Action" className="actions">
                    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                      <QuickEditModal dateKey={key} kind="expense" />
                      <DeleteRangeButton inline
                        kind="expense"
                        kindLabel="expense"
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
      <ExpenseWageDetails lines={wages} pagination={{ page: wageListing.page, total: wageListing.total, query: wageListing.query, pageParam: "wagePage", queryParam: "wageQuery" }} />
    </>
  );
}
