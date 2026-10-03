import type { Prisma } from "../generated/prisma/client";

type Tx = Prisma.TransactionClient;
export class RowEditError extends Error {}
export function inventoryPatch(body: Record<string, unknown>) {
  if (typeof body.particular !== "string" || !body.particular.trim() || body.particular.length > 500
    || typeof body.remark !== "string" || body.remark.length > 2000) throw new RowEditError("Enter a particular and a remark of at most 2,000 characters.");
  for (const key of ["quantityIn", "quantityOut", "balance"]) {
    const value = body[key];
    if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 100_000_000_000 || value !== Number(value.toFixed(3)))) throw new RowEditError("Quantities must be blank or nonnegative numbers with up to 3 decimal places.");
  }
  return { particular: body.particular.trim(), remark: body.remark.trim() || null, quantityIn: body.quantityIn as number | null, quantityOut: body.quantityOut as number | null, balance: body.balance as number | null };
}
export function wagePatch(body: Record<string, unknown>) {
  if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 500 || typeof body.amount !== "number" || !Number.isSafeInteger(body.amount) || body.amount < 0) throw new RowEditError("Enter a name and a nonnegative whole-kyat amount.");
  return { name: body.name.trim(), amount: BigInt(body.amount) };
}
export async function changeInventoryRow(tx: Tx, id: string, patch: ReturnType<typeof inventoryPatch> | null) {
  const row = await tx.inventoryEntry.findFirst({ where: { id, report: { status: "CONFIRMED" } } });
  if (!row) throw new RowEditError("Approved inventory row no longer exists. Refresh and try again.");
  if (patch) await tx.inventoryEntry.update({ where: { id }, data: patch });
  else await tx.inventoryEntry.delete({ where: { id } });
  if (row.sheetKind === "fuel") {
    const rows = await tx.inventoryEntry.findMany({ where: { reportId: row.reportId, sheetKind: "fuel" }, orderBy: { position: "asc" } });
    let previous: number | null = null;
    for (const item of rows) {
      const balance = item.balance === null ? null : Number(item.balance);
      const balanceOk = previous === null || balance === null ? null : Math.abs(previous + Number(item.quantityIn ?? 0) - Number(item.quantityOut ?? 0) - balance) < 0.001;
      await tx.inventoryEntry.update({ where: { id: item.id }, data: { balanceOk } });
      previous = balance;
    }
  }
}
export async function changeWageRow(tx: Tx, id: string, patch: ReturnType<typeof wagePatch> | null) {
  const row = await tx.expenseLine.findFirst({ where: { id, category: "WAGES", report: { status: "CONFIRMED" } } });
  if (!row) throw new RowEditError("Approved wages row no longer exists. Refresh and try again.");
  if (patch) await tx.expenseLine.update({ where: { id }, data: patch });
  else await tx.expenseLine.delete({ where: { id } });
  const total = await tx.expenseLine.aggregate({ where: { reportId: row.reportId }, _sum: { amount: true } });
  await tx.dailyReport.update({ where: { id: row.reportId }, data: { totalExpense: total._sum.amount ?? BigInt(0) } });
}
