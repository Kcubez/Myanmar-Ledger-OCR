import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireOwner } from "../../../../lib/require-owner";
import { parseDateParam, recalcTotals } from "../../../../lib/reports";

export const dynamic = "force-dynamic";

const REVENUE_METHODS = ["CASH", "KBZ_PAY", "MMQR", "KBZ_SPECIAL", "AYA_SPECIAL"] as const;
const EXPENSE_CATEGORIES = ["BUSINESS_DRAWING", "PERSONAL_DRAWING", "OPERATION", "WAGES"] as const;
const STATUSES = ["PENDING", "CONFIRMED", "NEEDS_REVIEW"] as const;

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
      JSON.stringify(report, (_key, value) => (typeof value === "bigint" ? Number(value) : value)),
    ),
  });
}

// PATCH /api/reports/2026-09-21 (admin) — replace lines per included type + recalc.
// Body: { status?, revenue?: [{method, amount}], expense?: [...], maintenance?: [...], fuel?: [...], brick?: [...] }
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { error } = await requireOwner(req);
  if (error) return error;
  const date = parseDateParam((await ctx.params).date);
  if (!date) return NextResponse.json({ message: "Invalid date (yyyy-mm-dd)" }, { status: 400 });
  const report = await prisma.dailyReport.findUnique({ where: { date } });
  if (!report) return NextResponse.json({ message: "Not found" }, { status: 404 });

  const body = (await req.json()) as Record<string, unknown>;
  const reportId = report.id;

  if (Array.isArray(body.revenue)) {
    const rows = (body.revenue as { method?: string; amount?: unknown }[]).filter((row) =>
      (REVENUE_METHODS as readonly string[]).includes(row.method ?? ""),
    );
    await prisma.revenueLine.deleteMany({ where: { reportId } });
    if (rows.length) {
      await prisma.revenueLine.createMany({
        data: rows.map((row) => ({
          reportId,
          method: row.method as (typeof REVENUE_METHODS)[number],
          amount: big(row.amount),
        })),
      });
    }
  }

  if (Array.isArray(body.expense)) {
    const rows = (body.expense as { category?: string; name?: string; role?: string; amount?: unknown }[]).filter(
      (row) => (EXPENSE_CATEGORIES as readonly string[]).includes(row.category ?? ""),
    );
    await prisma.expenseLine.deleteMany({ where: { reportId } });
    if (rows.length) {
      await prisma.expenseLine.createMany({
        data: rows.map((row) => ({
          reportId,
          category: row.category as (typeof EXPENSE_CATEGORIES)[number],
          name: row.name || null,
          role: row.role || null,
          amount: big(row.amount),
        })),
      });
    }
  }

  if (Array.isArray(body.maintenance)) {
    const rows = body.maintenance as { vehicle?: string; amount?: unknown; part?: string; vendor?: string }[];
    await prisma.maintenanceLine.deleteMany({ where: { reportId } });
    if (rows.length) {
      await prisma.maintenanceLine.createMany({
        data: rows.map((row) => ({
          reportId,
          vehicle: row.vehicle || "",
          amount: big(row.amount),
          part: row.part || null,
          vendor: row.vendor || null,
        })),
      });
    }
  }

  if (Array.isArray(body.fuel)) {
    const rows = body.fuel as {
      vehicle?: string; particular?: string; inGal?: unknown; outGal?: unknown; balanceGal?: unknown; balanceOk?: boolean | null;
    }[];
    await prisma.fuelEntry.deleteMany({ where: { reportId } });
    if (rows.length) {
      await prisma.fuelEntry.createMany({
        data: rows.map((row) => ({
          reportId,
          vehicle: row.vehicle || "",
          particular: row.particular || null,
          inGal: row.inGal === null || row.inGal === undefined || row.inGal === "" ? null : Number(row.inGal) || 0,
          outGal: row.outGal === null || row.outGal === undefined || row.outGal === "" ? null : Number(row.outGal) || 0,
          balanceGal: row.balanceGal === null || row.balanceGal === undefined || row.balanceGal === "" ? null : Number(row.balanceGal) || 0,
          balanceOk: row.balanceOk ?? null,
        })),
      });
    }
  }

  if (Array.isArray(body.brick)) {
    const rows = body.brick as { item?: string; qty?: unknown; unitPrice?: unknown; amount?: unknown }[];
    await prisma.brickEntry.deleteMany({ where: { reportId } });
    if (rows.length) {
      await prisma.brickEntry.createMany({
        data: rows.map((row) => ({
          reportId,
          item: row.item || "",
          qty: row.qty === null || row.qty === undefined || row.qty === "" ? null : Number(row.qty) || 0,
          unitPrice: row.unitPrice === null || row.unitPrice === undefined || row.unitPrice === "" ? null : big(row.unitPrice),
          amount: row.amount === null || row.amount === undefined || row.amount === "" ? null : big(row.amount),
        })),
      });
    }
  }

  await recalcTotals(reportId);
  const status = typeof body.status === "string" && (STATUSES as readonly string[]).includes(body.status)
    ? (body.status as (typeof STATUSES)[number])
    : undefined;
  const updated = await prisma.dailyReport.update({
    where: { id: reportId },
    data: { ...(status ? { status } : {}) },
  });
  if (status) {
    await prisma.telegramMessage.updateMany({
      where: { reportId },
      data: { status: status === "CONFIRMED" ? "confirmed" : status === "NEEDS_REVIEW" ? "rejected" : "extracted" },
    });
  }
  return NextResponse.json({
    report: JSON.parse(JSON.stringify(updated, (_key, value) => (typeof value === "bigint" ? Number(value) : value))),
  });
}
