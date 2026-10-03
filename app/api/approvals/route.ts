import { legacyPendingWhere, pendingReviewWhere, resolveUpload } from "../../../lib/pending-uploads";
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
  if (req.nextUrl.searchParams.get("countOnly") === "1") {
    const reports = await prisma.dailyReport.count({ where: legacyPendingWhere });
    const uploads = await prisma.pendingUpload.count({ where: await pendingReviewWhere() });
    return NextResponse.json({ count: reports + uploads });
  }
  const reports = await prisma.dailyReport.findMany({
    where: legacyPendingWhere,
    orderBy: { date: "desc" },
    include: {
      _count: {
        select: { revenueLines: true, expenseLines: true, maintenanceLines: true, fuelEntries: true, brickEntries: true, images: true },
      },
    },
  });
  const uploads = await prisma.pendingUpload.findMany({ where: await pendingReviewWhere(), select: { id: true } });
  return NextResponse.json({ reports: [...reports.map(serializeReport), ...uploads] });
}

// POST /api/approvals (admin) — { reportId, action: "approve" | "reject" }.
// Notifies the submitter's Telegram chat(s), like the bot-button flow does,
// so the chat doesn't stay stuck on "waiting for approver".
export async function POST(req: NextRequest) {
  const { error, session } = await requireOwner(req);
  if (error) return error;
  const body = (await req.json()) as { reportId?: string; uploadId?: string; action?: string };
  if (body.uploadId && (body.action === "approve" || body.action === "reject")) {
    try {
      const upload = await resolveUpload(body.uploadId, body.action === "approve");
      await finalizeReportMessages({ ownerUserId: session.user.id, reportId: upload.reportId, approved: body.action === "approve", messageIds: [upload.id] });
      return NextResponse.json({ ok: true });
    } catch (cause) {
      return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to review upload." }, { status: 409 });
    }
  }
  if (!body.reportId || (body.action !== "approve" && body.action !== "reject")) {
    return NextResponse.json({ message: "Provide reportId and action approve|reject" }, { status: 400 });
  }
  const approved = body.action === "approve";
  try {
    const recipients = await prisma.$transaction(async tx => {
      const report = await tx.dailyReport.findFirst({ where: { id: body.reportId, ...legacyPendingWhere } });
      if (!report) throw new Error("This report is already reviewed or no longer pending.");
      const uploads = await tx.pendingUpload.findMany({ where: { reportId: report.id }, select: { id: true, status: true } });
      if (!approved && uploads.some(upload => ["PENDING", "DRAFT"].includes(upload.status))) throw new Error("Review pending uploads before rejecting this legacy report.");
      const where = { reportId: report.id, id: { notIn: uploads.map(upload => upload.id) } };
      const messages = await tx.telegramMessage.findMany({ where, select: { chatId: true, botReplyMessageId: true } });
      await tx.telegramMessage.updateMany({ where, data: { status: approved ? "confirmed" : "rejected" } });
      if (approved) await tx.dailyReport.update({ where: { id: report.id }, data: { status: "CONFIRMED" } });
      else await tx.dailyReport.delete({ where: { id: report.id } });
      return messages;
    }, { isolationLevel: "Serializable" });
    await finalizeReportMessages({ ownerUserId: session.user.id, reportId: body.reportId, approved, recipients });
    return NextResponse.json({ ok: true, deleted: !approved });
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to review report." }, { status: 409 });
  }
}
