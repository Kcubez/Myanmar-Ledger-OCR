import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { requireOwner } from "../../../lib/require-owner";
import { serializeReport } from "../../../lib/reports";
import { sendTelegramMessage } from "../../../lib/telegram/client";

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

  // Fire-and-forget: approval itself must not fail if Telegram is down.
  void notifySubmitter(session.user.id, body.reportId, approved).catch((notifyError) =>
    console.error("Approval Telegram notify failed:", notifyError),
  );
  return NextResponse.json({ ok: true, status: report.status });
}

/** Resolve the owner's bot token (DB settings first, env fallback). */
async function resolveNotifyToken(ownerUserId: string): Promise<string | null> {
  const settings = await prisma.botSettings.findUnique({ where: { userId: ownerUserId } });
  if (settings?.botToken) return settings.botToken;
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return token ? token : null;
}

async function notifySubmitter(ownerUserId: string, reportId: string, approved: boolean): Promise<void> {
  const botToken = await resolveNotifyToken(ownerUserId);
  if (!botToken) {
    console.error("Approval notify skipped: no bot token (neither DB nor env).");
    return;
  }
  const messages = await prisma.telegramMessage.findMany({
    where: { reportId },
    select: { chatId: true },
  });
  const chats = [...new Set(messages.map((message) => message.chatId))];
  const label = approved ? "✅ <b>CONFIRMED</b>" : "❌ <b>REJECTED — ပြန်တင်ပေးပါ</b>";
  const text = approved
    ? `${label}\nသင့်တင်ထားသော report — dashboard မှာ မြင်ရပါပြီ။`
    : `${label}\nသင့်တင်ထားသော report.`;
  await Promise.allSettled(chats.map((chatId) => sendTelegramMessage({ botToken, chatId, text })));
}
