import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireOwner } from "../../../../lib/require-owner";
import { parseDateParam } from "../../../../lib/reports";
import type { ExtractedPayload } from "../../../../lib/persist-ledger";
import { parseInventoryResponse } from "../../../../lib/extract/inventory";
import { parseRevenueResponse } from "../../../../lib/extract/revenue";
import { parseExpenseResponse } from "../../../../lib/extract/expense";
import { parseMaintenanceResponse } from "../../../../lib/extract/maintenance";

type Ctx = { params: Promise<{ id: string }> };

function cleanedPayload(mode: string, original: ExtractedPayload, payload: ExtractedPayload): ExtractedPayload | null {
  if (!payload || payload.persistKind !== mode || !Array.isArray(payload.flags)) return null;
  const source = payload.lines;
  if (mode === "inventory") {
    const parsed = parseInventoryResponse(JSON.stringify({ date: payload.contentDateText, sheetKind: payload.sheetKind, rows: source }));
    if (!parsed.data.rows.length || (parsed.data.sheetKind !== "materials" && parsed.data.sheetKind !== "fuel")) return null;
    return { ...original, contentDateText: payload.contentDateText, sheetKind: parsed.data.sheetKind, lines: parsed.data.rows, flags: payload.flags };
  }
  if (mode === "revenue") {
    const rows = Array.isArray(source) ? source : [];
    const parsed = parseRevenueResponse(JSON.stringify(Object.fromEntries(rows.map((row) => {
      const value = row as { method?: string; amount?: string };
      return [String(value.method ?? "").toLowerCase(), value.amount ?? ""];
    }))));
    if (!parsed.data.lines.length) return null;
    return { ...original, contentDateText: payload.contentDateText, lines: parsed.data.lines, flags: payload.flags };
  }
  if (mode === "expense") {
    const value = source as { header?: Record<string, unknown>; wages?: unknown[] };
    const parsed = parseExpenseResponse(JSON.stringify({ ...(value?.header ?? {}), wages: value?.wages ?? [] }));
    if (!parsed.data.total && !parsed.data.wages.length && !parsed.data.business_drawing && !parsed.data.personal_drawing && !parsed.data.operation) return null;
    return { ...original, contentDateText: payload.contentDateText, lines: { header: {
      total: parsed.data.total, business_drawing: parsed.data.business_drawing, personal_drawing: parsed.data.personal_drawing, operation: parsed.data.operation,
    }, wages: parsed.data.wages }, flags: payload.flags };
  }
  if (mode === "maintenance") {
    const parsed = parseMaintenanceResponse(JSON.stringify({ date: payload.contentDateText, lines: source }));
    if (!parsed.data.lines.length) return null;
    return { ...original, contentDateText: payload.contentDateText, lines: parsed.data.lines, flags: payload.flags };
  }
  return null;
}

// Corrections remain staged in PendingUpload. persistLines only sees this
// payload after the owner presses Approve.
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const guard = await requireOwner(req);
  if (guard.error) return guard.error;
  const body = await req.json().catch(() => null) as { payload?: ExtractedPayload; date?: string } | null;
  const date = typeof body?.date === "string" ? parseDateParam(body.date) : null;
  if (!body?.payload || !date) return NextResponse.json({ message: "Provide a valid photo date and extracted rows." }, { status: 400 });

  try {
    const { id } = await ctx.params;
    const upload = await prisma.$transaction(async (tx) => {
      const existing = await tx.pendingUpload.findUnique({ where: { id }, include: { report: true } });
      if (!existing || existing.status !== "PENDING") throw new Error("Pending upload not found.");
      const message = await tx.telegramMessage.findUnique({ where: { id } });
      if (message?.status !== "approval_requested") throw new Error("Submit this upload for review before editing it here.");
      const payload = cleanedPayload(existing.mode, existing.payload as unknown as ExtractedPayload, body.payload!);
      if (!payload) throw new Error("The edited rows are incomplete or invalid.");
      // Keep the staged OCR payload and the report bucket aligned. This is
      // still only pending data; no live ledger line is touched here.
      payload.contentDateText = date.toISOString().slice(0, 10);

      let reportId = existing.reportId;
      if (existing.effectiveDate.getTime() !== date.getTime()) {
        const target = await tx.dailyReport.upsert({ where: { date }, create: { date, status: "PENDING" }, update: {} });
        reportId = target.id;
        await tx.sourceImage.updateMany({ where: { submissionId: id }, data: { reportId } });
        await tx.telegramMessage.updateMany({ where: { id }, data: { reportId } });
      }
      return tx.pendingUpload.update({ where: { id }, data: { reportId, effectiveDate: date, payload: JSON.parse(JSON.stringify(payload)) } });
    }, { isolationLevel: "Serializable", timeout: 30000 });
    return NextResponse.json({ ok: true, date: upload.effectiveDate.toISOString().slice(0, 10) });
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to save corrections." }, { status: 409 });
  }
}
