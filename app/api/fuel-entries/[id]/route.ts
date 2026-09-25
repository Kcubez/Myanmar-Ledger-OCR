import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireOwner } from "../../../../lib/require-owner";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/fuel-entries/:id — delete one fuel row and recalculate its
// report's denormalized fuel totals. Sibling types and images stay intact.
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const guard = await requireOwner(req);
  if (guard.error) return guard.error;

  const { id } = await ctx.params;
  const entry = await prisma.fuelEntry.findUnique({ where: { id }, select: { reportId: true } });
  if (!entry) return NextResponse.json({ message: "Not found." }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.fuelEntry.delete({ where: { id } });
    const sums = await tx.fuelEntry.aggregate({
      where: { reportId: entry.reportId },
      _sum: { inGal: true, outGal: true },
    });
    await tx.dailyReport.update({
      where: { id: entry.reportId },
      data: { totalFuelIn: sums._sum.inGal ?? 0, totalFuelOut: sums._sum.outGal ?? 0 },
    });
  });
  return NextResponse.json({ ok: true });
}
