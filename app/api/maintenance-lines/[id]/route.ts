import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireOwner } from "../../../../lib/require-owner";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/maintenance-lines/:id — delete one maintenance row.
// Maintenance has no denormalized totals, so no recalculation is needed.
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const guard = await requireOwner(req);
  if (guard.error) return guard.error;

  const { id } = await ctx.params;
  const line = await prisma.maintenanceLine.findUnique({ where: { id }, select: { id: true } });
  if (!line) return NextResponse.json({ message: "Not found." }, { status: 404 });

  await prisma.maintenanceLine.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
