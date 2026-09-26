import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireOwner } from "../../../../lib/require-owner";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/brick-entries/:id — delete one brick row.
// Brick has no denormalized totals, so no recalculation is needed.
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const guard = await requireOwner(req);
  if (guard.error) return guard.error;

  const { id } = await ctx.params;
  const entry = await prisma.brickEntry.findUnique({ where: { id }, select: { id: true } });
  if (!entry) return NextResponse.json({ message: "Not found." }, { status: 404 });

  await prisma.brickEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
