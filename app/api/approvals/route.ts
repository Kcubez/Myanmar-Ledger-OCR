import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { requireOwner } from "../../../lib/require-owner";
import { serializeReport } from "../../../lib/reports";
import { finalizeReportMessages } from "../../../lib/telegram/notify";

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
// Notifies the submitter's Telegram chat(s), like the bot-button flow does,
// so the chat doesn't stay stuck on "waiting for approver".
export async function POST(req: NextRequest) {
  const { error, session } = await requireOwner(req);
  if (error) return error;
  const body = (await req.json()) as { reportId?: string; action?: string };
  if (!body.reportId || (body.action !== "approve" && body.action !== "reject")) {
    return NextResponse.json({ message: "Provide reportId and action approve|reject" }, { status: 400 });
  }
  const approved = body.action === "approve";
  const status = approved ? "CONFIRMED" : "NEEDS_REVIEW";
  const report = await prisma.dailyReport.update({
    where: { id: body.reportId },
    data: { status },
  });
  await prisma.telegramMessage.updateMany({
    where: { reportId: body.reportId },
    data: { status: approved ? "confirmed" : "rejected" },
  });

  // Awaited (not fire-and-forget): serverless runtimes can freeze the function
  // the moment the response returns, killing a background Telegram call.
  // Approval itself already committed above; this only affects the notify.
  let telegramUpdated = false;
  try {
    await finalizeReportMessages({ ownerUserId: session.user.id, reportId: body.reportId, approved });
    telegramUpdated = true;
  } catch (notifyError) {
    console.error("Approval Telegram notify failed:", notifyError);
  }
  return NextResponse.json({ ok: true, status: report.status, telegramUpdated });
}
