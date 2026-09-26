import { prisma } from "./prisma";

const num = (value: bigint | number | string | null | undefined): number =>
  value === null || value === undefined ? 0 : Number(value);

const dec = (value: { toString(): string } | number | string | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value.toString());

/** JSON-safe report row for list views (BigInt/Decimal → number). */
export function serializeReport(report: {
  id: string;
  date: Date;
  status: string;
  totalRevenue: bigint;
  totalExpense: bigint;
  totalFuelIn: unknown;
  totalFuelOut: unknown;
  createdAt: Date;
  updatedAt: Date;
  _count?: Record<string, number>;
}) {
  return {
    id: report.id,
    date: report.date.toISOString(),
    status: report.status,
    totalRevenue: Number(report.totalRevenue),
    totalExpense: Number(report.totalExpense),
    totalFuelIn: dec(report.totalFuelIn as { toString(): string } | null),
    totalFuelOut: dec(report.totalFuelOut as { toString(): string } | null),
    counts: report._count ?? undefined,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  };
}

/** Recompute denormalized totals from lines. Call after every line write. */
export async function recalcTotals(reportId: string) {
  const [revenue, expense, fuel] = await Promise.all([
    prisma.revenueLine.aggregate({ where: { reportId }, _sum: { amount: true } }),
    prisma.expenseLine.aggregate({ where: { reportId }, _sum: { amount: true } }),
    prisma.fuelEntry.aggregate({
      where: { reportId },
      _sum: { inGal: true, outGal: true },
    }),
  ]);
  await prisma.dailyReport.update({
    where: { id: reportId },
    data: {
      totalRevenue: revenue._sum.amount ?? BigInt(0),
      totalExpense: expense._sum.amount ?? BigInt(0),
      // NOTE: ?? 0, never ?? undefined — undefined is a Prisma no-op and
      // would leave stale totals behind after clearing all fuel entries.
      totalFuelIn: fuel._sum.inGal ?? 0,
      totalFuelOut: fuel._sum.outGal ?? 0,
    },
  });
}

/** Parse a yyyy-mm-dd route param to a UTC-midnight Date, or null. */
export function parseDateParam(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Reject = delete everything. Marks linked Telegram messages "rejected",
 * then deletes the DailyReport — all 5 line types + source-image rows
 * cascade; message rows survive with reportId set to null (history).
 * Callers must finalize Telegram notes BEFORE calling this (finalize looks
 * messages up by reportId).
 */
export async function deleteReportCascade(reportId: string): Promise<void> {
  await prisma.telegramMessage.updateMany({
    where: { reportId },
    data: { status: "rejected" },
  });
  await prisma.dailyReport.delete({ where: { id: reportId } });
}

export { num, dec };
