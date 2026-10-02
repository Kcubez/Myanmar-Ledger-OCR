import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { requireOwner } from "../../../lib/require-owner";

import { entryDateWhere } from "../../../lib/date-filter";

export const dynamic = "force-dynamic";

// DELETE /api/ledger-entries — bulk delete fuel|brick|revenue|expense entries in a UTC range.
// Body: { kind: "fuel"|"brick"|"revenue"|"expense", gte?: ISO|null, lte?: ISO|null }.
// Only entries of that kind are removed; sibling ledger types, source images,
// and reports stay intact. Denormalized totals are recalculated per affected
// report (fuel: in/out; revenue/expense: totals; brick/maintenance have none).
export async function DELETE(req: NextRequest) {
  const guard = await requireOwner(req);
  if (guard.error) return guard.error;

  const body = (await req.json().catch(() => ({}))) as { kind?: string; gte?: string | null; lte?: string | null; category?: string };
  if (body.kind !== "fuel" && body.kind !== "brick" && body.kind !== "revenue" && body.kind !== "expense" && body.kind !== "inventory" && body.kind !== "maintenance") {
    return NextResponse.json({ message: "Invalid ledger kind." }, { status: 400 });
  }
  if (body.category !== undefined && (body.kind !== "inventory" || !["sand", "gravel", "cement", "brick", "fuel"].includes(body.category))) {
    return NextResponse.json({ message: "Invalid inventory category." }, { status: 400 });
  }
  const gte = body.gte ? new Date(body.gte) : null;
  const lte = body.lte ? new Date(body.lte) : null;
  if ((gte && Number.isNaN(gte.getTime())) || (lte && Number.isNaN(lte.getTime()))) {
    return NextResponse.json({ message: "Invalid gte/lte." }, { status: 400 });
  }
  if (gte && lte && gte >= lte) {
    return NextResponse.json({ message: "gte must be before lte." }, { status: 400 });
  }
  const dateFilter: { gte?: Date; lt?: Date } = {};
  if (gte) dateFilter.gte = gte;
  if (lte) dateFilter.lt = lte;

  // A failed total update must roll back the deletion as well.
  const deleted = await prisma.$transaction(async (tx) => {
    const rowWhere = { ...entryDateWhere(dateFilter), report: { status: "CONFIRMED" as const } };
    const reports = await tx.dailyReport.findMany({
      where: body.kind === "fuel"
        ? { fuelEntries: { some: rowWhere } }
        : body.kind === "brick"
          ? { brickEntries: { some: rowWhere } }
          : { date: dateFilter, status: "CONFIRMED" },
      select: { id: true },
    });
    const ids = reports.map((report) => report.id);
    let deleted = 0;
    if (ids.length) {
      if (body.kind === "fuel") {
        deleted = (await tx.fuelEntry.deleteMany({ where: rowWhere })).count;
        const sums = await tx.fuelEntry.groupBy({
          by: ["reportId"],
          where: { reportId: { in: ids } },
          _sum: { inGal: true, outGal: true },
        });
        const byReport = new Map(sums.map((row) => [row.reportId, row._sum]));
        for (const id of ids) {
          const sum = byReport.get(id);
          await tx.dailyReport.update({
            where: { id },
            data: { totalFuelIn: sum?.inGal ?? 0, totalFuelOut: sum?.outGal ?? 0 },
          });
        }
      } else if (body.kind === "brick") {
        deleted = (await tx.brickEntry.deleteMany({ where: rowWhere })).count;
      } else if (body.kind === "inventory") {
        deleted = (await tx.inventoryEntry.deleteMany({ where: { reportId: { in: ids }, ...(body.category ? { category: body.category } : {}) } })).count;
      } else if (body.kind === "maintenance") {
        deleted = (await tx.maintenanceLine.deleteMany({ where: { reportId: { in: ids } } })).count;
      } else if (body.kind === "revenue") {
        deleted = (await tx.revenueLine.deleteMany({ where: { reportId: { in: ids } } })).count;
        const sums = await tx.revenueLine.groupBy({
          by: ["reportId"],
          where: { reportId: { in: ids } },
          _sum: { amount: true },
        });
        const byReport = new Map(sums.map((row) => [row.reportId, row._sum]));
        for (const id of ids) {
          await tx.dailyReport.update({
            where: { id },
            data: { totalRevenue: byReport.get(id)?.amount ?? BigInt(0) },
          });
        }
      } else {
        deleted = (await tx.expenseLine.deleteMany({ where: { reportId: { in: ids } } })).count;
        const sums = await tx.expenseLine.groupBy({
          by: ["reportId"],
          where: { reportId: { in: ids } },
          _sum: { amount: true },
        });
        const byReport = new Map(sums.map((row) => [row.reportId, row._sum]));
        for (const id of ids) {
          await tx.dailyReport.update({
            where: { id },
            data: { totalExpense: byReport.get(id)?.amount ?? BigInt(0) },
          });
        }
      }
    }
    return deleted;
  }, { isolationLevel: "Serializable", timeout: 30000 });
  return NextResponse.json({ ok: true, deleted });
}
