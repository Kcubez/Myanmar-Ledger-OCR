import { ownerPageOrRedirect } from "../../lib/owner-page";
import { prisma } from "../../lib/prisma";
import { parseDateFilter, rangeWhere } from "../../lib/date-filter";
import { AppShell, PageHeader, StatCard } from "../../components/layout";
import { DateFilter } from "../../components/DateFilter";
import { DeleteRangeButton } from "../../components/DeleteRangeButton";
import { QuickEditModal } from "../../components/QuickEditModal";
import { BarChart } from "../../components/charts";

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
  const range = parseDateFilter(await searchParams);
  const where = rangeWhere(range);

  // CONFIRMED only — pending reports are reviewed in Approvals first.
  const confirmed = { status: "CONFIRMED" } as const;
  const [lines, lineCount] = await Promise.all([
    prisma.expenseLine.findMany({
      where: { report: { date: where, ...confirmed } },
      orderBy: [{ report: { date: "asc" } }, { id: "asc" }],
      include: { report: { select: { date: true } } },
    }),
    prisma.expenseLine.count({ where: { report: { date: where, ...confirmed } } }),
  ]);

  const byDay = new Map<string, { total: number; cats: Record<string, number>; wages: number; count: number }>();
  for (const line of lines) {
    const key = dayKey(line.report.date);
    let day = byDay.get(key);
    if (!day) {
      day = { total: 0, cats: {}, wages: 0, count: 0 };
      byDay.set(key, day);
    }
    const amount = Number(line.amount);
    day.total += amount;
    day.cats[line.category] = (day.cats[line.category] ?? 0) + amount;
    if (line.category === "WAGES") day.wages += 1;
    day.count += 1;
  }
  const days = [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  const total = days.reduce((s, [, day]) => s + day.total, 0);
  const byCategory = CATEGORIES.map((cat) => ({
    label: cat.replace(/_/g, " "),
    value: days.reduce((s, [, day]) => s + (day.cats[cat] ?? 0), 0),
  })).filter((row) => row.value > 0);

  return (
    <AppShell>
      <PageHeader
        eyebrow="LEDGER DASHBOARD"
        title="Expense"
        sub={`${range.label} · daily OPEX split · ${lineCount} lines`}
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

      <section className="stats" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }} aria-label="Expense totals">
        <StatCard label="Total expense" value={`${Math.round(total).toLocaleString()} Ks`} tone="bad" />
        <StatCard label="Days" value={`${days.length}`} sub={range.label} />
      </section>

      <section className="card pad">
        <h2>Expense by category</h2>
        {byCategory.length ? (
          <BarChart data={byCategory} color="#a63434" />
        ) : (
          <p className="muted">No expense lines yet.</p>
        )}
      </section>

      <section className="card pad" style={{ marginTop: 16 }}>
        <h2>Daily expense</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Total</th>
                <th>Business</th>
                <th>Personal</th>
                <th>Operation</th>
                <th>Wages</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {days.map(([key, day]) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td>{Math.round(day.total).toLocaleString()}</td>
                  <td>{Math.round(day.cats.BUSINESS_DRAWING ?? 0).toLocaleString()}</td>
                  <td>{Math.round(day.cats.PERSONAL_DRAWING ?? 0).toLocaleString()}</td>
                  <td>{Math.round(day.cats.OPERATION ?? 0).toLocaleString()}</td>
                  <td>{day.wages === 0 ? "—" : `${day.wages} rows · ${Math.round(day.cats.WAGES ?? 0).toLocaleString()}`}</td>
                  <td>
                    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                      <a href={`/reports/${key}#ledger-EXPENSE`}>Open</a>
                      <QuickEditModal dateKey={key} kind="expense" />
                      <DeleteRangeButton
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
          </table>
        </div>
      </section>
    </AppShell>
  );
}
