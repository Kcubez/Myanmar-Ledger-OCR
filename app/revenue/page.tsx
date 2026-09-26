import { ownerPageOrRedirect } from "../../lib/owner-page";
import { prisma } from "../../lib/prisma";
import { parseDateFilter, rangeWhere } from "../../lib/date-filter";
import { AppShell, PageHeader, StatCard } from "../../components/layout";
import { DateFilter } from "../../components/DateFilter";
import { DeleteRangeButton } from "../../components/DeleteRangeButton";
import { QuickEditModal } from "../../components/QuickEditModal";
import { DonutChart } from "../../components/charts";

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
  const range = parseDateFilter(await searchParams);
  const where = rangeWhere(range);

  // CONFIRMED only — pending reports are reviewed in Approvals first.
  const confirmed = { status: "CONFIRMED" } as const;
  const [lines, lineCount] = await Promise.all([
    prisma.revenueLine.findMany({
      where: { report: { date: where, ...confirmed } },
      orderBy: [{ report: { date: "asc" } }, { id: "asc" }],
      include: { report: { select: { date: true } } },
    }),
    prisma.revenueLine.count({ where: { report: { date: where, ...confirmed } } }),
  ]);

  const byDay = new Map<string, { total: number; methods: Record<string, number>; count: number }>();
  for (const line of lines) {
    const key = dayKey(line.report.date);
    let day = byDay.get(key);
    if (!day) {
      day = { total: 0, methods: {}, count: 0 };
      byDay.set(key, day);
    }
    const amount = Number(line.amount);
    day.total += amount;
    day.methods[line.method] = (day.methods[line.method] ?? 0) + amount;
    day.count += 1;
  }
  const days = [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  const total = days.reduce((s, [, day]) => s + day.total, 0);
  const byMethod = METHODS.map((method) => ({
    label: METHOD_LABELS[method],
    value: days.reduce((s, [, day]) => s + (day.methods[method] ?? 0), 0),
  })).filter((row) => row.value > 0);

  return (
    <AppShell>
      <PageHeader
        eyebrow="LEDGER DASHBOARD"
        title="Revenue"
        sub={`${range.label} · daily payment split · ${lineCount} lines`}
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
        <StatCard label="Total revenue" value={`${Math.round(total).toLocaleString()} Ks`} tone="good" />
        <StatCard label="Days" value={`${days.length}`} sub={range.label} />
      </section>

      <section className="card pad">
        <h2>Revenue by payment</h2>
        {byMethod.length ? (
          <DonutChart slices={byMethod} />
        ) : (
          <p className="muted">No revenue lines yet.</p>
        )}
      </section>

      <section className="card pad" style={{ marginTop: 16 }}>
        <h2>Daily revenue</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Total</th>
                <th>Cash</th>
                <th>KBZ Pay</th>
                <th>MMQR</th>
                <th>KBZ Sp</th>
                <th>AYA Sp</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {days.map(([key, day]) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td>{Math.round(day.total).toLocaleString()}</td>
                  <td>{Math.round(day.methods.CASH ?? 0).toLocaleString()}</td>
                  <td>{Math.round(day.methods.KBZ_PAY ?? 0).toLocaleString()}</td>
                  <td>{Math.round(day.methods.MMQR ?? 0).toLocaleString()}</td>
                  <td>{Math.round(day.methods.KBZ_SPECIAL ?? 0).toLocaleString()}</td>
                  <td>{Math.round(day.methods.AYA_SPECIAL ?? 0).toLocaleString()}</td>
                  <td>
                    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                      <QuickEditModal dateKey={key} kind="revenue" />
                      <DeleteRangeButton
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
          </table>
        </div>
      </section>
    </AppShell>
  );
}
