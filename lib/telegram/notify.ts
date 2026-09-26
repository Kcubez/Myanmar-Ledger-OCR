import { prisma } from "../prisma";
import { editTelegramMessage, sendTelegramMessage } from "./client";

/** Resolve the owner's bot token (DB settings first, env fallback). */
async function resolveNotifyToken(ownerUserId: string): Promise<string | null> {
  const settings = await prisma.botSettings.findUnique({ where: { userId: ownerUserId } });
  if (settings?.botToken) return settings.botToken;
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return token ? token : null;
}

const FINAL_TEXT = {
  approved: "✅ Dashboard ထဲရောက်ပါပြီ။",
  rejected: "❌ ပြန်တင်ပေးပါ။",
} as const;

/**
 * Resolve the stale bot messages for a report (the "⏳ waiting" notes) by
 * editing them in place to the final state — never throws.
 *
 * Falls back to a fresh ✅/❌ message per submitter chat when there is nothing
 * stored to edit (legacy rows) or every edit fails (e.g. Telegram's ~48h edit
 * window has passed). Callers should fire-and-forget: resolution itself must
 * not fail if Telegram is down.
 */
export async function finalizeReportMessages(opts: {
  botToken?: string | null;
  ownerUserId?: string;
  reportId: string;
  approved: boolean;
}): Promise<void> {
  try {
    const botToken = opts.botToken ?? (opts.ownerUserId ? await resolveNotifyToken(opts.ownerUserId) : null);
    if (!botToken) {
      console.error("Approval notify skipped: no bot token (neither DB nor env).");
      return;
    }
    const rows = await prisma.telegramMessage.findMany({
      where: { reportId: opts.reportId },
      select: { chatId: true, botReplyMessageId: true },
    });
    const chats = [...new Set(rows.map((row) => row.chatId))];
    const finalText = opts.approved ? FINAL_TEXT.approved : FINAL_TEXT.rejected;

    // Edit each stored bot reply in place (dedupe: several rows can share one ⏳).
    const seen = new Set<string>();
    const edits = await Promise.allSettled(
      rows.flatMap((row) => {
        if (row.botReplyMessageId === null) return [];
        const key = `${row.chatId}:${row.botReplyMessageId}`;
        if (seen.has(key)) return [];
        seen.add(key);
        return [
          editTelegramMessage({
            botToken,
            chatId: row.chatId,
            messageId: row.botReplyMessageId,
            text: finalText,
            replyMarkup: { inline_keyboard: [] },
          }),
        ];
      }),
    );
    const edited = edits.some(
      (result) => result.status === "fulfilled" && result.value === true,
    );
    if (edited) return;

    // Nothing to edit (or all edits failed) — send a fresh status message.
    const label = opts.approved ? "✅ <b>CONFIRMED</b>" : "❌ <b>REJECTED — ပြန်တင်ပေးပါ</b>";
    const text = opts.approved
      ? `${label}\nသင့်တင်ထားသော report — dashboard မှာ မြင်ရပါပြီ။`
      : `${label}\nသင့်တင်ထားသော report.`;
    await Promise.allSettled(chats.map((chatId) => sendTelegramMessage({ botToken, chatId, text })));
  } catch (error) {
    console.error("Finalize report messages failed:", error);
  }
}
