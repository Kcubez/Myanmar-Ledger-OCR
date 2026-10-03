import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireOwner } from "../../../../lib/require-owner";
import { inventoryPatch, changeInventoryRow, RowEditError } from "../../../../lib/ledger-row-edit";

type Ctx = { params: Promise<{ id: string }> };
async function mutate(req: NextRequest, ctx: Ctx, remove: boolean) {
  const guard = await requireOwner(req);
  if (guard.error) return guard.error;
  try {
    const { id } = await ctx.params;
    const body = remove ? null : await req.json().catch(() => null);
    if (!remove && (!body || typeof body !== "object" || Array.isArray(body))) throw new RowEditError("Invalid request.");
    const patch = remove ? null : inventoryPatch(body);
    await prisma.$transaction(tx => changeInventoryRow(tx, id, patch), { isolationLevel: "Serializable", timeout: 30000 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RowEditError) return NextResponse.json({ message: error.message }, { status: 400 });
    return NextResponse.json({ message: "Unable to save. Refresh the records before trying again." }, { status: 409 });
  }
}
export const PATCH = (req: NextRequest, ctx: Ctx) => mutate(req, ctx, false);
export const DELETE = (req: NextRequest, ctx: Ctx) => mutate(req, ctx, true);
