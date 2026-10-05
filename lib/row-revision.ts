import { createHash } from "node:crypto";

type Scalar = { toString(): string } | string | number | bigint | boolean | null | undefined;
const value = (input: Scalar) => input === null || input === undefined ? null : typeof input === "bigint" ? input.toString() : typeof input === "object" ? input.toString() : input;
const digest = (parts: Scalar[]) => createHash("sha256").update(JSON.stringify(parts.map(value))).digest("hex");

/** Stable version tokens for the two row-level editors. */
export function inventoryRowRevision(row: {
  id: string; reportId: string; sheetKind: string; position: number; category: string; particular: string; remark: string | null;
  unit: string; quantityIn: Scalar; quantityOut: Scalar; balance: Scalar; balanceOk: boolean | null;
}) {
  return digest(["inventory", row.id, row.reportId, row.sheetKind, row.position, row.category, row.particular, row.remark, row.unit, row.quantityIn, row.quantityOut, row.balance, row.balanceOk]);
}

export function wageRowRevision(row: { id: string; reportId: string; category: string; name: string | null; amount: Scalar }) {
  return digest(["wage", row.id, row.reportId, row.category, row.name, row.amount]);
}
