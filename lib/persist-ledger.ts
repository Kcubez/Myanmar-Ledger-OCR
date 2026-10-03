import { inventoryQuantity, parseInventoryResponse } from "./extract/inventory";
import type { Prisma } from "../generated/prisma/client";
import { amountFrom, type LedgerType } from "./extract";
import { operationIsWageSubtotal } from "./extract/expense";
import { extractContentDate } from "./report-date";
import { hasLedgerContent } from "./extraction-content";

export type ExtractedPayload = {
  contentDateText: string;
  rawText: string;
  summary: string;
  persistKind: LedgerType;
  lines: unknown;
  confidence: number;
  flags: string[];
  sheetKind?: "materials" | "fuel";
};

type Tx = Prisma.TransactionClient;

/** Order-normalized signature so "5/9" and "05/09" compare equal. */
function fuelSig(row: { date: Date; particular: string | null; inGal: unknown; outGal: unknown; balanceGal: unknown }): string {
  const num = (v: unknown) => (v === null || v === undefined || v === "" ? "" : String(Number(v)));
  return [row.date.toISOString().slice(0, 10), row.particular ?? "", num(row.inGal), num(row.outGal), num(row.balanceGal)].join("|");
}

function brickSig(row: { date: Date; item: string; qty: unknown; unitPrice: unknown; amount: unknown }): string {
  const num = (v: unknown) => (v === null || v === undefined || v === "" ? "" : String(Number(v)));
  return [row.date.toISOString().slice(0, 10), row.item, num(row.qty), num(row.unitPrice), num(row.amount)].join("|");
}

export async function persistLines(tx: Tx, reportId: string, mode: LedgerType, extracted: ExtractedPayload, reportDate: Date): Promise<{ added: number; skipped: number }> {
  if (!hasLedgerContent(mode, extracted.lines)) throw new Error("No readable ledger rows. Reject this upload and resend a clearer photo.");
  const big = (value: string): bigint => BigInt(Math.round(amountFrom(value)));
  switch (mode) {
    case "inventory": {
      const parsed = parseInventoryResponse(JSON.stringify({ date: extracted.contentDateText, sheetKind: extracted.sheetKind, rows: extracted.lines }));
      if (!parsed.data.rows.length) throw new Error("Inventory sheet has no valid rows.");
      const sheetKind = parsed.data.sheetKind;
      await tx.inventoryEntry.deleteMany({ where: { reportId, sheetKind } });
      await tx.inventoryEntry.createMany({ data: parsed.data.rows.map((row, position) => ({
        reportId, sheetKind, position, category: row.category, particular: row.particular, remark: row.remark || null,
        unit: row.unit, quantityIn: inventoryQuantity(row.in), quantityOut: inventoryQuantity(row.out),
        balance: inventoryQuantity(row.balance), balanceOk: row.balance_ok,
      })) });
      return { added: parsed.data.rows.length, skipped: 0 };
    }
    case "revenue": {
      const lines = extracted.lines as { method: string; amount: string }[];
      await tx.revenueLine.deleteMany({ where: { reportId } });
      if (lines.length) {
        await tx.revenueLine.createMany({
          data: lines.map((line) => ({
            reportId,
            method: line.method as "CASH" | "KBZ_PAY" | "MMQR" | "KBZ_SPECIAL" | "AYA_SPECIAL",
            amount: big(line.amount),
          })),
        });
      }
      const total = lines.reduce((sum, line) => sum + amountFrom(line.amount), 0);
      await tx.dailyReport.update({ where: { id: reportId }, data: { totalRevenue: BigInt(Math.round(total)) } });
      return { added: lines.length, skipped: 0 };
    }
    case "expense": {
      const payload = extracted.lines as {
        header: { business_drawing: string; personal_drawing: string; operation: string; total: string };
        wages: { name: string; amount: string }[];
      };
      await tx.expenseLine.deleteMany({ where: { reportId } });
      const rows: { reportId: string; category: "BUSINESS_DRAWING" | "PERSONAL_DRAWING" | "OPERATION" | "WAGES"; name: string | null; amount: bigint }[] = [];
      if (payload.header.business_drawing) rows.push({ reportId, category: "BUSINESS_DRAWING", name: null, amount: big(payload.header.business_drawing) });
      if (payload.header.personal_drawing) rows.push({ reportId, category: "PERSONAL_DRAWING", name: null, amount: big(payload.header.personal_drawing) });
      // Labour detail replaces its matching subtotal, never adds to it.
      const labourSubtotal = operationIsWageSubtotal({ ...payload.header, wages: payload.wages });
      if (payload.header.operation && !labourSubtotal) rows.push({ reportId, category: "OPERATION", name: null, amount: big(payload.header.operation) });
      for (const wage of payload.wages) {
        rows.push({ reportId, category: "WAGES", name: wage.name || null, amount: big(wage.amount) });
      }
      if (rows.length) await tx.expenseLine.createMany({ data: rows });
      const total = rows.reduce((sum, row) => sum + Number(row.amount), 0);
      await tx.dailyReport.update({ where: { id: reportId }, data: { totalExpense: BigInt(Math.round(total)) } });
      return { added: rows.length, skipped: 0 };
    }
    case "maintenance": {
      const lines = extracted.lines as { vehicle: string; amount: string; part: string }[];
      await tx.maintenanceLine.deleteMany({ where: { reportId } });
      if (lines.length) {
        await tx.maintenanceLine.createMany({
          data: lines.map((line) => ({
            reportId, vehicle: line.vehicle, amount: big(line.amount),
            part: line.part || null,
          })),
        });
      }
      return { added: lines.length, skipped: 0 };
    }
    case "fuel": {
      const rows = extracted.lines as { date: string; particular: string; in_gal: string; out_gal: string; balance_gal: string; balance_ok: boolean | null }[];
      // Ditto-fill: empty row dates inherit the nearest date above; the
      // report date is the last resort (never leave null on fresh rows).
      let carry: Date | null = null;
      const prepared = rows.map((row) => {
        const parsed = row.date ? extractContentDate(row.date) : null;
        if (parsed) carry = parsed;
        return {
          reportId, vehicle: "", particular: row.particular || null,
          date: carry ?? reportDate,
          inGal: row.in_gal ? amountFrom(row.in_gal) : null,
          outGal: row.out_gal ? amountFrom(row.out_gal) : null,
          balanceGal: row.balance_gal ? amountFrom(row.balance_gal) : null,
          balanceOk: row.balance_ok,
        };
      });
      const existing = await tx.fuelEntry.findMany({
        where: { reportId },
        select: { date: true, particular: true, inGal: true, outGal: true, balanceGal: true },
      });
      const seen = new Set(existing.map((row) => fuelSig({ ...row, date: row.date ?? reportDate })));
      const fresh = prepared.filter((row) => !seen.has(fuelSig(row)));
      if (fresh.length) await tx.fuelEntry.createMany({ data: fresh });
      // Totals reflect ALL rows for the report (existing + fresh).
      const sums = await tx.fuelEntry.aggregate({ where: { reportId }, _sum: { inGal: true, outGal: true } });
      await tx.dailyReport.update({ where: { id: reportId }, data: { totalFuelIn: sums._sum.inGal ?? 0, totalFuelOut: sums._sum.outGal ?? 0 } });
      return { added: fresh.length, skipped: prepared.length - fresh.length };
    }
    case "brick": {
      const rows = extracted.lines as { date: string; item: string; qty: string; unit_price: string; amount: string }[];
      // Ditto-fill like fuel: empty row dates inherit the nearest date above.
      let carry: Date | null = null;
      const prepared = rows.map((row) => {
        const parsed = row.date ? extractContentDate(row.date) : null;
        if (parsed) carry = parsed;
        return {
          reportId, item: row.item,
          date: carry ?? reportDate,
          qty: row.qty ? amountFrom(row.qty) : null,
          unitPrice: row.unit_price ? big(row.unit_price) : null,
          amount: row.amount ? big(row.amount) : null,
        };
      });
      const existing = await tx.brickEntry.findMany({
        where: { reportId },
        select: { date: true, item: true, qty: true, unitPrice: true, amount: true },
      });
      const seen = new Set(existing.map((row) => brickSig({ ...row, date: row.date ?? reportDate })));
      const fresh = prepared.filter((row) => !seen.has(brickSig(row)));
      if (fresh.length) await tx.brickEntry.createMany({ data: fresh });
      return { added: fresh.length, skipped: prepared.length - fresh.length };
    }
  }
}
