import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { requireOwner } from "../../../../../lib/require-owner";
import { parseDateParam } from "../../../../../lib/reports";

type Ctx = { params: Promise<{ id: string }> };

function noDateConflict(mode: string) {
  return new Error(`A ${mode} submission already exists for that date.`);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const guard = await requireOwner(req);
  if (guard.error) return guard.error;
  const body = await req.json().catch(() => null) as { date?: unknown } | null;
  const date = typeof body?.date === "string" ? parseDateParam(body.date) : null;
  if (!date) return NextResponse.json({ message: "Enter a valid date." }, { status: 400 });

  try {
    const { id } = await ctx.params;
    const result = await prisma.$transaction(async (tx) => {
      const submission = await tx.pendingUpload.findUnique({ where: { id }, include: { report: true } });
      if (!submission || submission.status !== "CONFIRMED") throw new Error("Approved submission not found.");
      if (submission.effectiveDate.getTime() === date.getTime()) return { date };

      let target = await tx.dailyReport.findUnique({ where: { date } });
      if (!target) target = await tx.dailyReport.create({ data: { date, status: "CONFIRMED" } });

      if (submission.mode === "revenue") {
        if (await tx.revenueLine.count({ where: { reportId: target.id } })) throw noDateConflict("revenue");
        await tx.revenueLine.updateMany({ where: { submissionId: id }, data: { reportId: target.id } });
      } else if (submission.mode === "expense") {
        if (await tx.expenseLine.count({ where: { reportId: target.id } })) throw noDateConflict("expense");
        await tx.expenseLine.updateMany({ where: { submissionId: id }, data: { reportId: target.id } });
      } else if (submission.mode === "maintenance") {
        if (await tx.maintenanceLine.count({ where: { reportId: target.id } })) throw noDateConflict("maintenance");
        await tx.maintenanceLine.updateMany({ where: { submissionId: id }, data: { reportId: target.id } });
      } else if (submission.mode === "inventory") {
        const sourceRows = await tx.inventoryEntry.findMany({ where: { submissionId: id }, select: { sheetKind: true } });
        for (const sheetKind of new Set(sourceRows.map((row) => row.sheetKind))) {
          if (await tx.inventoryEntry.count({ where: { reportId: target.id, sheetKind } })) throw noDateConflict(`inventory ${sheetKind}`);
        }
        await tx.inventoryEntry.updateMany({ where: { submissionId: id }, data: { reportId: target.id } });
      } else {
        throw new Error("This legacy ledger cannot be moved by submission.");
      }

      await tx.pendingUpload.update({ where: { id }, data: { reportId: target.id, effectiveDate: date } });
      await tx.sourceImage.updateMany({ where: { submissionId: id }, data: { reportId: target.id } });
      await tx.telegramMessage.updateMany({ where: { id }, data: { reportId: target.id } });

      const totals = async (reportId: string) => {
        const revenue = await tx.revenueLine.aggregate({ where: { reportId }, _sum: { amount: true } });
        const expense = await tx.expenseLine.aggregate({ where: { reportId }, _sum: { amount: true } });
        const inventory = await tx.inventoryEntry.count({ where: { reportId } });
        await tx.dailyReport.update({ where: { id: reportId }, data: {
          status: "CONFIRMED", totalRevenue: revenue._sum.amount ?? BigInt(0), totalExpense: expense._sum.amount ?? BigInt(0),
        } });
        return inventory;
      };
      await totals(submission.reportId);
      await totals(target.id);
      const source = await tx.dailyReport.findUnique({
        where: { id: submission.reportId },
        select: { _count: { select: {
          revenueLines: true, expenseLines: true, maintenanceLines: true, fuelEntries: true, brickEntries: true,
          inventoryEntries: true, pendingUploads: true, images: true, telegramMessages: true,
        } } },
      });
      if (source && Object.values(source._count).every((count) => count === 0)) {
        await tx.dailyReport.delete({ where: { id: submission.reportId } });
      }
      return { date: target.date };
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 30000 });
    return NextResponse.json({ ok: true, date: result.date.toISOString().slice(0, 10) });
  } catch (cause) {
    const code = (cause as { code?: string })?.code;
    if (code === "P2034" || code === "P2002") return NextResponse.json({ message: "The date changed in another tab. Refresh and try again." }, { status: 409 });
    const message = cause instanceof Error ? cause.message : "Unable to move this submission.";
    return NextResponse.json({ message }, { status: 409 });
  }
}
