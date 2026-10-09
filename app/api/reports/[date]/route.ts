import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireOwner } from "../../../../lib/require-owner";
import { parseDateParam } from "../../../../lib/reports";
import { extractContentDate } from "../../../../lib/report-date";
import { editableRelations, reportRevision } from "../../../../lib/report-revision";
import { validateReportPatch } from "../../../../lib/report-patch-validation";

export const dynamic = "force-dynamic";

const REVENUE_METHODS = ["CASH", "KBZ_PAY", "MMQR", "KBZ_SPECIAL", "AYA_SPECIAL"] as const;
const EXPENSE_CATEGORIES = ["BUSINESS_DRAWING", "PERSONAL_DRAWING", "OPERATION", "WAGES"] as const;

type Ctx = { params: Promise<{ date: string }> };

async function load(date: Date) {
  return prisma.dailyReport.findUnique({
    where: { date },
    include: {
      revenueLines: true,
      expenseLines: true,
      maintenanceLines: true,
      fuelEntries: true,
      brickEntries: true,
      images: true,
      telegramMessages: { select: { chatId: true, messageId: true, status: true } },
    },
  });
}

const big = (value: unknown): bigint => {
  const n = typeof value === "string" ? Number(value.replace(/[^0-9.-]/g, "")) : Number(value);
  return BigInt(Number.isFinite(n) ? Math.round(n) : 0);
};

// GET /api/reports/2026-09-21 — full detail (BigInt-safe).
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { error } = await requireOwner(_req);
  if (error) return error;
  const date = parseDateParam((await ctx.params).date);
  if (!date) return NextResponse.json({ message: "Invalid date (yyyy-mm-dd)" }, { status: 400 });
  const report = await load(date);
  if (!report) return NextResponse.json({ message: "Not found" }, { status: 404 });
  return NextResponse.json({
    report: JSON.parse(
      JSON.stringify({ ...report, revision: reportRevision(report) }, (_key, value) => (typeof value === "bigint" ? Number(value) : value)),
    ),
  });
}

// PATCH /api/reports/2026-09-21 (admin) — replace lines per included type + recalc.
// Body: { status?, revenue?: [{method, amount}], expense?: [...], maintenance?: [...], fuel?: [...], brick?: [...] }
// All-or-nothing via $transaction: a crash mid-replace must never leave
// deleted-but-not-reinserted lines behind.
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { error } = await requireOwner(req);
  if (error) return error;
  const date = parseDateParam((await ctx.params).date);
  if (!date) return NextResponse.json({ message: "Invalid date (yyyy-mm-dd)" }, { status: 400 });
  const report = await prisma.dailyReport.findUnique({ where: { date } });
  if (!report) return NextResponse.json({ message: "Not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    const input: unknown = await req.json();
    validateReportPatch(input);
    body = input;
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Invalid edit." }, { status: 400 });
  }
  const reportId = report.id;
  try {
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.dailyReport.findUnique({ where: { id: reportId }, include: editableRelations });
    if (!current || reportRevision(current) !== body.expectedRevision) throw new Error("STALE_REPORT");
    if (Array.isArray(body.revenue)) {
      const rows = (body.revenue as { method?: string; amount?: unknown; submissionId?: unknown }[]).filter((row) =>
        (REVENUE_METHODS as readonly string[]).includes(row.method ?? ""),
      );
      await tx.revenueLine.deleteMany({ where: { reportId } });
      if (rows.length) {
        await tx.revenueLine.createMany({
          data: rows.map((row) => ({
            reportId,
            submissionId: typeof row.submissionId === "string" ? row.submissionId : null,
            method: row.method as (typeof REVENUE_METHODS)[number],
            amount: big(row.amount),
          })),
        });
      }
    }

    if (Array.isArray(body.expense)) {
      const rows = (body.expense as { category?: string; name?: string; amount?: unknown; submissionId?: unknown }[]).filter(
        (row) => (EXPENSE_CATEGORIES as readonly string[]).includes(row.category ?? ""),
      );
      await tx.expenseLine.deleteMany({ where: { reportId } });
      if (rows.length) {
        await tx.expenseLine.createMany({
          data: rows.map((row) => ({
            reportId,
            submissionId: typeof row.submissionId === "string" ? row.submissionId : null,
            category: row.category as (typeof EXPENSE_CATEGORIES)[number],
            name: row.name || null,
            amount: big(row.amount),
          })),
        });
      }
    }

    if (Array.isArray(body.maintenance)) {
      const rows = body.maintenance as { vehicle?: string; amount?: unknown; part?: string; submissionId?: unknown }[];
      await tx.maintenanceLine.deleteMany({ where: { reportId } });
      if (rows.length) {
        await tx.maintenanceLine.createMany({
          data: rows.map((row) => ({
            reportId,
            submissionId: typeof row.submissionId === "string" ? row.submissionId : null,
            vehicle: row.vehicle || "",
            amount: big(row.amount),
            part: row.part || null,
          })),
        });
      }
    }

    if (Array.isArray(body.fuel)) {
      const rows = body.fuel as {
        particular?: string; date?: unknown; inGal?: unknown; outGal?: unknown; balanceGal?: unknown; balanceOk?: boolean | null; submissionId?: unknown;
      }[];
      await tx.fuelEntry.deleteMany({ where: { reportId } });
      if (rows.length) {
        await tx.fuelEntry.createMany({
          data: rows.map((row) => ({
            reportId,
            submissionId: typeof row.submissionId === "string" ? row.submissionId : null,
            vehicle: "",
            particular: row.particular || null,
            // Round-tripped per-row date (Telegram ingest); fallback = page date.
            date: typeof row.date === "string" && row.date ? (extractContentDate(row.date) ?? date) : date,
            inGal: row.inGal === null || row.inGal === undefined || row.inGal === "" ? null : Number(row.inGal) || 0,
            outGal: row.outGal === null || row.outGal === undefined || row.outGal === "" ? null : Number(row.outGal) || 0,
            balanceGal: row.balanceGal === null || row.balanceGal === undefined || row.balanceGal === "" ? null : Number(row.balanceGal) || 0,
            balanceOk: row.balanceOk ?? null,
          })),
        });
      }
    }

    if (Array.isArray(body.brick)) {
      const rows = body.brick as { item?: string; date?: unknown; qty?: unknown; unitPrice?: unknown; amount?: unknown; submissionId?: unknown }[];
      await tx.brickEntry.deleteMany({ where: { reportId } });
      if (rows.length) {
        await tx.brickEntry.createMany({
          data: rows.map((row) => ({
            reportId,
            submissionId: typeof row.submissionId === "string" ? row.submissionId : null,
            item: row.item || "",
            // Round-tripped per-row date (Telegram ingest); fallback = page date.
            date: typeof row.date === "string" && row.date ? (extractContentDate(row.date) ?? date) : date,
            qty: row.qty === null || row.qty === undefined || row.qty === "" ? null : Number(row.qty) || 0,
            unitPrice: row.unitPrice === null || row.unitPrice === undefined || row.unitPrice === "" ? null : big(row.unitPrice),
            amount: row.amount === null || row.amount === undefined || row.amount === "" ? null : big(row.amount),
          })),
        });
      }
    }

    // An interactive transaction owns one database connection. Run these
    // aggregates in sequence: Promise.all cannot parallelize them and can
    // cause concurrent-client warnings with the pg adapter.
    const revenue = await tx.revenueLine.aggregate({ where: { reportId }, _sum: { amount: true } });
    const expense = await tx.expenseLine.aggregate({ where: { reportId }, _sum: { amount: true } });
    const fuel = await tx.fuelEntry.aggregate({ where: { reportId }, _sum: { inGal: true, outGal: true } });
    const next = await tx.dailyReport.update({
      where: { id: reportId },
      data: {
        totalRevenue: revenue._sum.amount ?? BigInt(0),
        totalExpense: expense._sum.amount ?? BigInt(0),
        totalFuelIn: fuel._sum.inGal ?? 0,
        totalFuelOut: fuel._sum.outGal ?? 0,
      },
    });
    return next;
  }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 30000 });

  return NextResponse.json({
    report: JSON.parse(JSON.stringify(updated, (_key, value) => (typeof value === "bigint" ? Number(value) : value))),
  });
  } catch (cause) {
    if ((cause instanceof Error && cause.message === "STALE_REPORT") || (cause as { code?: string })?.code === "P2034") {
      return NextResponse.json({ message: "This report changed while you were editing. Close and reopen the editor to load the latest data." }, { status: 409 });
    }
    if ((cause as { code?: string })?.code === "P2002") {
      return NextResponse.json({ message: "A report already exists for that date. Choose a different date." }, { status: 409 });
    }
    if ((cause as { code?: string })?.code === "P2028") {
      return NextResponse.json({ message: "Saving the report timed out. No changes were saved; please try again." }, { status: 503 });
    }
    throw cause;
  }
}
