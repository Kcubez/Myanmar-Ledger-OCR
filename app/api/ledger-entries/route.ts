import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { requireOwner } from "../../../lib/require-owner";

export const dynamic = "force-dynamic";

// DELETE /api/ledger-entries — bulk delete fuel|brick|revenue|expense entries in a UTC range.
// Body: { kind: "fuel"|"brick"|"revenue"|"expense", gte?: ISO|null, lte?: ISO|null }.
// Only entries of that kind are removed; sibling ledger types, source images,
// and reports stay intact. Denormalized totals are recalculated per affected
// report (fuel: in/out; revenue/expense: totals; brick/maintenance have none).
export async function DELETE(req: NextRequest) {
  const guard = await requireOwner(req);
  if (guard.error) return guard.error;

  const body = (await req.json().catch(() => ({}))) as { kind?: string; gte?: string | null; lte?: string | null };
  if (body.kind !== "fuel" && body.kind !== "brick" && body.kind !== "revenue" && body.kind !== "expense") {
    return NextResponse.json({ message: "kind must be fuel|brick|revenue|expense." }, { status: 400 });
  }
  const gte = body.gte ? new Date(body.gte) : null;
  const lte = body.lte ? new Date(body.lte) : null;
  if ((gte && Number.isNaN(gte.getTime())) || (lte && Number.isNaN(lte.getTime()))) {
    return NextResponse.json({ message: "Invalid gte/lte." }, { status: 400 });
  }
  const dateFilter: { gte?: Date; lt?: Date } = {};
  if (gte) dateFilter.gte = gte;
  if (lte) dateFilter.lt = lte;

  const reports = await prisma.dailyReport.findMany({
    where: { date: dateFilter },
    select: { id: true },
  });
  const ids = reports.map((report) => report.id);
  let deleted = 0;
  if (ids.length) {
    if (body.kind === "fuel") {
      deleted = (await prisma.fuelEntry.deleteMany({ where: { reportId: { in: ids } } })).count;
      const sums = await prisma.fuelEntry.groupBy({
        by: ["reportId"],
        where: { reportId: { in: ids } },
        _sum: { inGal: true, outGal: true },
      });
      const byReport = new Map(sums.map((row) => [row.reportId, row._sum]));
      for (const id of ids) {
        const sum = byReport.get(id);
        await prisma.dailyReport.update({
          where: { id },
          data: { totalFuelIn: sum?.inGal ?? 0, totalFuelOut: sum?.outGal ?? 0 },
        });
      }
    } else if (body.kind === "brick") {
      deleted = (await prisma.brickEntry.deleteMany({ where: { reportId: { in: ids } } })).count;
    } else if (body.kind === "revenue") {
      deleted = (await prisma.revenueLine.deleteMany({ where: { reportId: { in: ids } } })).count;
      const sums = await prisma.revenueLine.groupBy({
        by: ["reportId"],
        where: { reportId: { in: ids } },
        _sum: { amount: true },
      });
      const byReport = new Map(sums.map((row) => [row.reportId, row._sum]));
      for (const id of ids) {
        await prisma.dailyReport.update({
          where: { id },
          data: { totalRevenue: byReport.get(id)?.amount ?? BigInt(0) },
        });
      }
    } else {
      deleted = (await prisma.expenseLine.deleteMany({ where: { reportId: { in: ids } } })).count;
      const sums = await prisma.expenseLine.groupBy({
        by: ["reportId"],
        where: { reportId: { in: ids } },
        _sum: { amount: true },
      });
      const byReport = new Map(sums.map((row) => [row.reportId, row._sum]));
      for (const id of ids) {
        await prisma.dailyReport.update({
          where: { id },
          data: { totalExpense: byReport.get(id)?.amount ?? BigInt(0) },
        });
      }
    }
  }
  return NextResponse.json({ ok: true, deleted });
}
