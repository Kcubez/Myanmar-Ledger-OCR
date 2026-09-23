import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { requireOwner } from "../../../lib/require-owner";
import { serializeReport } from "../../../lib/reports";

export const dynamic = "force-dynamic";

// GET /api/approvals — PENDING + NEEDS_REVIEW reports (any signed-in user).
export async function GET(req: NextRequest) {
  const { error } = await requireOwner(req);
  if (error) return error;
  const reports = await prisma.dailyReport.findMany({
    where: { status: { in: ["PENDING", "NEEDS_REVIEW"] } },
    orderBy: { date: "desc" },
    include: {
      _count: {
        select: { revenueLines: true, expenseLines: true, maintenanceLines: true, fuelEntries: true, brickEntries: true, images: true },
      },
    },
  });
  return NextResponse.json({ reports: reports.map(serializeReport) });
}

// POST /api/approvals (admin) — { reportId, action: "approve" | "reject" }.
export async function POST(req: NextRequest) {
  const { error } = await requireOwner(req);
  if (error) return error;
  const body = (await req.json()) as { reportId?: string; action?: string };
  if (!body.reportId || (body.action !== "approve" && body.action !== "reject")) {
    return NextResponse.json({ message: "Provide reportId and action approve|reject" }, { status: 400 });
  }
  const status = body.action === "approve" ? "CONFIRMED" : "NEEDS_REVIEW";
  const report = await prisma.dailyReport.update({
    where: { id: body.reportId },
    data: { status },
  });
  await prisma.telegramMessage.updateMany({
    where: { reportId: body.reportId },
    data: { status: body.action === "approve" ? "confirmed" : "rejected" },
  });
  return NextResponse.json({ ok: true, status: report.status });
}
