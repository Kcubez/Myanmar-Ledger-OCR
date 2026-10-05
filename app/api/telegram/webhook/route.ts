import type { ExtractedPayload } from "../../../../lib/persist-ledger";
import { hasLedgerContent } from "../../../../lib/extraction-content";
import { finalizeReportMessages } from "../../../../lib/telegram/notify";
import { NextRequest, NextResponse, after } from "next/server";
import sharp from "sharp";

// Leave time for download, persistence and Telegram notification after Gemini.
export const maxDuration = 180;
import { prisma } from "../../../../lib/prisma";
import {
  sendTelegramMessage,
  answerCallbackQuery,
  editTelegramMessage,
  editMessageButtons,
  downloadTelegramFile,
  getFileInfoFromMessage,
} from "../../../../lib/telegram/client";
import {
  extractionEmptyMessage,
  processingCompleteMessage,
  processingFailedMessage,
  waitingForApprovalMessage,
  submitterRejectedMessage,
  buildExtractPreviewMessage,
  buildLedgerMenuButtons,
  buildLinkKeyboard,
  getFormatPromptForMode,
  getLinkInstructions,
  ledgerLabel,
  escapeHtml,
} from "../../../../lib/telegram/templates";
import {
  upsertSender,
  isSenderAuthorized,
  getOwnerUserId,
  isPrismaUniqueConstraintError,
} from "../../../../lib/telegram/senders";
import { sendOTPEmail } from "../../../../lib/email";
import { dateKey, resolveReportDate, extractContentDate } from "../../../../lib/report-date";
import {
  parseKeyList,
  extractWithKeyRotation,
  RetryableExhaustedError,
  TerminalExtractError,
  dominantReason,
  amountFrom,
  isLedgerType,
  LEDGER_TYPES,
  inventoryPrompt,
  parseInventoryResponse,
  type LedgerType,
  type ExtractReason,
} from "../../../../lib/extract";
import { revenuePrompt, parseRevenueResponse } from "../../../../lib/extract/revenue";
import { expensePrompt, parseExpenseResponse } from "../../../../lib/extract/expense";
import { maintenancePrompt, parseMaintenanceResponse } from "../../../../lib/extract/maintenance";
import { fuelPrompt, parseFuelResponse } from "../../../../lib/extract/fuel";
import { brickPrompt, parseBrickResponse } from "../../../../lib/extract/brick";

export const runtime = "nodejs";

const FALLBACK_MODEL = "gemini-3.5-flash";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const OTP_TTL_MS = 10 * 60 * 1000;

type BotRuntime = {
  botToken: string;
  keys: string[];
  model: string;
  ownerUserId: string | null;
  viaDb: boolean;
};

type TelegramUser = { id: number; first_name?: string; last_name?: string; username?: string };
type TelegramUpdate = {
  message?: Record<string, unknown>;
  callback_query?: { id: string; data?: string; from: TelegramUser; message?: { chat: { id: number }; message_id: number } };
};

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function sixDigitOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ─── Authorization gate: runs BEFORE any Gemini/file work ────────────────────

async function gate(
  sender: { isVerified: boolean; isAuthorized: boolean },
  botToken: string,
  chatId: number,
): Promise<boolean> {
  if (isSenderAuthorized(sender)) return true;
  await sendTelegramMessage({
    botToken,
    chatId,
    text: [
      "🚫 <b>ဝင်ရောက်ခွင့် မရှိပါ</b>",
      "",
      getLinkInstructions(),
    ].join("\n"),
    replyMarkup: buildLinkKeyboard(),
  });
  return false;
}

async function modeAccess(
  sender: { activeReportType: string; allowedLedgers: string[] },
  botToken: string,
  chatId: number,
): Promise<LedgerType | null> {
  const mode = sender.activeReportType;
  if ((LEDGER_TYPES as readonly string[]).includes(mode) && isLedgerType(mode) && sender.allowedLedgers.includes(mode)) return mode;
  await sendTelegramMessage({
    botToken,
    chatId,
    text: [
      "📋 <b>Choose ledger type</b>",
      "",
      sender.allowedLedgers.length
        ? "Available ledger types:"
        : "No ledger access yet. Contact your administrator.",
    ].join("\n"),
    replyMarkup: buildLedgerMenuButtons(sender.allowedLedgers),
  });
  return null;
}

// ─── Bot config: DB settings first (BAI-commerce pattern), env fallback ─────
// The Settings page writes BotSettings; until the owner saves there, the
// TELEGRAM_* / GEMINI_API_KEYS env vars keep serving (fallback slated for
// removal one release after cutover).
async function resolveBotConfig(headerSecret: string | null): Promise<BotRuntime | null> {
  if (headerSecret) {
    const settings = await prisma.botSettings.findFirst({
      where: { webhookSecret: headerSecret, isActive: true },
    });
    if (settings?.botToken) {
      // DB key field accepts comma-separated keys for rotation (same syntax as GEMINI_API_KEYS).
      const dbKeys = parseKeyList(settings.geminiApiKey);
      return {
        botToken: settings.botToken,
        keys: dbKeys.length ? dbKeys : parseKeyList(process.env.GEMINI_API_KEYS),
        model: settings.geminiModel || FALLBACK_MODEL,
        ownerUserId: settings.userId,
        viaDb: true,
      };
    }
  }
  const expectedSecret = env("TELEGRAM_WEBHOOK_SECRET");
  const botToken = env("TELEGRAM_BOT_TOKEN");
  if (!expectedSecret || !botToken || headerSecret !== expectedSecret) return null;
  return {
    botToken,
    keys: parseKeyList(process.env.GEMINI_API_KEYS),
    model: FALLBACK_MODEL,
    ownerUserId: await getOwnerUserId(),
    viaDb: false,
  };
}

// ─── Webhook entry ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const runtime = await resolveBotConfig(req.headers.get("x-telegram-bot-api-secret-token"));
  if (!runtime) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!runtime.keys.length) {
    console.error("Telegram webhook has no Gemini keys (neither DB nor env).");
  }
  const { botToken } = runtime;
  const ownerUserId = runtime.ownerUserId;

  let body: TelegramUpdate;
  try {
    body = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  // ── Button presses ──
  if (body.callback_query?.data && body.callback_query.from) {
    const query = body.callback_query;
    const sender = await upsertSender(query.from, ownerUserId);
    const chatId = query.message?.chat.id;
    const messageId = query.message?.message_id;
    if (!chatId || !messageId) {
      await answerCallbackQuery(botToken, query.id, "OK");
      return NextResponse.json({ ok: true });
    }
    await handleCallback(botToken, sender, chatId, messageId, query.id, query.data ?? "");
    return NextResponse.json({ ok: true });
  }

  // ── Messages ──
  const message = body.message;
  if (!message || !message.from) return NextResponse.json({ ok: true });
  const from = message.from as TelegramUser;
  const chat = message.chat as { id: number } | undefined;
  const chatId = chat?.id;
  const messageId = message.message_id as number | undefined;
  if (!chatId || !messageId) return NextResponse.json({ ok: true });

  const sender = await upsertSender(from, ownerUserId);
  await prisma.telegramSender.update({
    where: { id: sender.id },
    data: { messageCount: { increment: 1 }, lastMessageAt: new Date() },
  }).catch(() => undefined);

  const text = typeof message.text === "string" ? message.text.trim() : "";
  const fileInfo = getFileInfoFromMessage(message);

  if (text) {
    await handleText(botToken, ownerUserId, sender, chatId, text);
    return NextResponse.json({ ok: true });
  }

  if (fileInfo) {
    if (!fileInfo.mimeType.startsWith("image/") && !ALLOWED_MIME.has(fileInfo.mimeType)) {
      await sendTelegramMessage({ botToken, chatId, text: "JPG, PNG, WEBP ပုံများသာ လက်ခံပါသည်။" });
      return NextResponse.json({ ok: true });
    }
    if (fileInfo.fileSize > MAX_FILE_SIZE) {
      await sendTelegramMessage({ botToken, chatId, text: "ပုံကြီးလွန်းပါသည် (10 MB အောက် ပို့ပေးပါ)။" });
      return NextResponse.json({ ok: true });
    }
    // Dedupe: Telegram may redeliver updates.
    const created = await recordIncomingMessage(String(chatId), messageId);
    if (!created) return NextResponse.json({ ok: true });

    if (!(await gate(sender, botToken, chatId))) return NextResponse.json({ ok: true });
    const mode = await modeAccess(sender, botToken, chatId);
    if (!mode) return NextResponse.json({ ok: true });

    const processing = await sendTelegramMessage({ botToken, chatId, text: `📥 လက်ခံရရှိပါပြီ — ${ledgerLabel(mode)} စစ်ဆေးနေသည်…` });
    const updateProgress = async (text: string) => {
      const edited = processing && await editTelegramMessage({ botToken, chatId, messageId: processing.message_id, text });
      if (!edited) await sendTelegramMessage({ botToken, chatId, text });
    };
    after(async () => {
      try {
        await processPhoto(botToken, runtime.keys, runtime.model, String(chatId), messageId, fileInfo.fileId, mode, updateProgress);
      } catch (error) {
        console.error("processPhoto failed:", error);
        await updateProgress(processingFailedMessage);
      }
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}

// ─── Text commands ───────────────────────────────────────────────────────────

async function handleText(
  botToken: string,
  ownerUserId: string | null,
  sender: {
    id: string;
    telegramUserId: bigint | null;
    activeReportType: string;
    isVerified: boolean;
    isAuthorized: boolean;
    otpCode: string | null;
    otpExpiresAt: Date | null;
    email: string | null;
  },
  chatId: number,
  text: string,
) {
  // OTP entry: pending code + 6 digits.
  if (sender.activeReportType === "awaiting_otp" && sender.otpCode && /^\d{6}$/.test(text)) {
    if (sender.otpCode !== text || !sender.otpExpiresAt || sender.otpExpiresAt < new Date()) {
      await sendTelegramMessage({ botToken, chatId, text: "❌ OTP is incorrect or expired. Tap <code>/link</code> to request a new code.", replyMarkup: buildLinkKeyboard() });
      return;
    }
    // Inherit pre-registered scopes from an admin-created row.
    // The placeholder (telegramUserId null) is consumed here so /settings
    // stops showing a stale PENDING duplicate next to the LINKED row.
    const pre = sender.email && ownerUserId
      ? await prisma.telegramSender.findFirst({
          where: {
            email: sender.email,
            id: { not: sender.id },
            userId: ownerUserId,
            OR: [{ telegramUserId: null }, { telegramUserId: sender.telegramUserId }],
          },
        })
      : null;
    if (!pre) {
      await prisma.telegramSender.update({
        where: { id: sender.id },
        data: { otpCode: null, otpExpiresAt: null, activeReportType: "none", isVerified: false, isAuthorized: false },
      });
      await sendTelegramMessage({
        botToken,
        chatId,
        text: "❌ This email is no longer authorized. Ask your administrator to add it in Settings, then tap <code>/link</code> again.",
        replyMarkup: buildLinkKeyboard(),
      });
      return;
    }
    await prisma.telegramSender.update({
      where: { id: sender.id },
      data: {
        isVerified: true,
        isAuthorized: pre.isAuthorized,
        allowedLedgers: pre.allowedLedgers,
        otpCode: null,
        otpExpiresAt: null,
        activeReportType: "none",
      },
    });
    if (pre.telegramUserId === null) {
      await prisma.telegramSender.delete({ where: { id: pre.id } }).catch(() => undefined);
    }
    const updated = await prisma.telegramSender.findUnique({ where: { id: sender.id } });
    await sendTelegramMessage({
      botToken,
      chatId,
      text: updated?.isAuthorized
        ? ["✅ <b>Account linked</b>", "", "Choose a ledger type, then send a photo.\nအောက်မှ ledger ကိုရွေးပြီး photo တင်နိုင်ပါပြီ။"].join("\n")
        : "⏳ Your email is verified, but ledger access is still awaiting administrator approval.",
      replyMarkup: buildLedgerMenuButtons(updated?.allowedLedgers ?? []),
    });
    return;
  }

  if (text === "/start") {
    const full = await prisma.telegramSender.findUnique({ where: { id: sender.id } });
    if (full && isSenderAuthorized(full)) {
      await sendTelegramMessage({
        botToken,
        chatId,
        text: "📋 <b>Choose ledger type</b>",
        replyMarkup: buildLedgerMenuButtons(full.allowedLedgers),
      });
      return;
    }
    await sendTelegramMessage({
      botToken,
      chatId,
      text: ["🤖 <b>Ledger Bot</b> မှ ကြိုဆိုပါတယ်!", "", getLinkInstructions()].join("\n"),
      replyMarkup: buildLinkKeyboard(),
    });
    return;
  }

  if (text === "/menu") {
    const full = await prisma.telegramSender.findUnique({ where: { id: sender.id } });
    if (!full || !(await gate(full, botToken, chatId))) return;
    await sendTelegramMessage({
      botToken,
      chatId,
      text: "📋 <b>Choose ledger type</b>",
      replyMarkup: buildLedgerMenuButtons(full.allowedLedgers),
    });
    return;
  }

  if (text === "/format" || text === "/template") {
    const full = await prisma.telegramSender.findUnique({ where: { id: sender.id } });
    if (!full || !(await gate(full, botToken, chatId))) return;
    const mode = isLedgerType(full.activeReportType) ? full.activeReportType : null;
    await sendTelegramMessage({ botToken, chatId, text: getFormatPromptForMode(mode) });
    return;
  }

  if (text === "/unlink") {
    await prisma.telegramSender.update({
      where: { id: sender.id },
      data: { email: null, isVerified: false, isAuthorized: false, otpCode: null, otpExpiresAt: null, activeReportType: "none", allowedLedgers: [] },
    });
    await sendTelegramMessage({ botToken, chatId, text: "🔓 Account unlinked. Tap <code>/link</code> to connect again.", replyMarkup: buildLinkKeyboard() });
    return;
  }

  if (text === "/link") {
    if (isSenderAuthorized(sender)) {
      await sendTelegramMessage({
        botToken,
        chatId,
        text: "✅ Your account is already linked. Use <code>/menu</code> to choose a ledger, or <code>/unlink</code> before linking a different email.",
      });
      return;
    }
    await prisma.telegramSender.update({
      where: { id: sender.id },
      // Keep an already-linked account intact until a new email has passed
      // the pre-registration check. This prevents an abandoned relink flow
      // from accidentally removing its access.
      data: { activeReportType: "awaiting_email", otpCode: null, otpExpiresAt: null },
    });
    await sendTelegramMessage({
      botToken,
      chatId,
      text: "🔐 <b>Link your account</b>\n\nSend the email address registered by your administrator.\nAdmin စာရင်းသွင်းထားသော email ကို ရိုက်ပို့ပါ။",
      replyMarkup: buildLinkKeyboard(),
    });
    return;
  }

  // Backward-compatible shortcut for people who already use /link email.
  const inlineLinkEmail = text.startsWith("/link ") ? text.replace("/link", "").trim() : null;
  if (sender.activeReportType === "awaiting_email" || inlineLinkEmail !== null) {
    const email = (inlineLinkEmail ?? text).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await sendTelegramMessage({ botToken, chatId, text: "⚠️ Please send a valid email, for example <code>name@company.com</code>.", replyMarkup: buildLinkKeyboard() });
      return;
    }
    const pre = ownerUserId
      ? await prisma.telegramSender.findFirst({
          where: {
            email,
            userId: ownerUserId,
            OR: [{ telegramUserId: null }, { telegramUserId: sender.telegramUserId }],
          },
        })
      : null;
    if (!pre) {
      await sendTelegramMessage({
        botToken,
        chatId,
        text: `❌ <code>${escapeHtml(email)}</code> is not registered for this Ledger. Please ask your administrator to add it in Settings.`,
        replyMarkup: buildLinkKeyboard(),
      });
      return;
    }
    const otp = sixDigitOtp();
    await prisma.telegramSender.update({
      where: { id: sender.id },
      data: { email, otpCode: otp, otpExpiresAt: new Date(Date.now() + OTP_TTL_MS), activeReportType: "awaiting_otp", isVerified: false, isAuthorized: false },
    });
    const sent = await sendOTPEmail(email, otp);
    if (!sent) {
      await prisma.telegramSender.update({
        where: { id: sender.id },
        data: { otpCode: null, otpExpiresAt: null, activeReportType: "awaiting_email" },
      });
    }
    await sendTelegramMessage({
      botToken,
      chatId,
      text: sent
        ? `📨 A 6-digit OTP was sent to <b>${escapeHtml(email)}</b>. Enter it here within 10 minutes.\nOTP ကို ဒီ chat ထဲမှာ ရိုက်ထည့်ပါ။`
        : "❌ We could not send the OTP email. Please try again later.",
      replyMarkup: buildLinkKeyboard(),
    });
    return;
  }

  await sendTelegramMessage({
    botToken,
    chatId,
    text: "To send a photo, choose a ledger from <code>/menu</code> first.\nအကောင့်ချိတ်ရန် <code>/link</code> ကိုနှိပ်ပါ။",
  });
}

// ─── Button presses ──────────────────────────────────────────────────────────

async function handleCallback(
  botToken: string,
  sender: { id: string; telegramUserId: bigint | null },
  chatId: number,
  messageId: number,
  queryId: string,
  data: string,
) {
  const full = await prisma.telegramSender.findUnique({ where: { id: sender.id } });
  if (!full || !(await gate(full, botToken, chatId))) {
    await answerCallbackQuery(botToken, queryId, "Unauthorized");
    return;
  }

  if (data === "action:menu" || data === "action:submit") {
    await answerCallbackQuery(botToken, queryId, "OK");
    await editTelegramMessage({
      botToken,
      chatId,
      messageId,
      text: "📋 <b>Choose ledger type</b>",
      replyMarkup: buildLedgerMenuButtons(full.allowedLedgers),
    });
    return;
  }

  if (data === "action:format") {
    await answerCallbackQuery(botToken, queryId, "OK");
    const mode = isLedgerType(full.activeReportType) ? full.activeReportType : null;
    await editTelegramMessage({ botToken, chatId, messageId, text: getFormatPromptForMode(mode) });
    return;
  }

  if (data.startsWith("mode:")) {
    const mode = data.replace("mode:", "");
    if (!isLedgerType(mode) || !(LEDGER_TYPES as readonly string[]).includes(mode)) {
      await answerCallbackQuery(botToken, queryId, "Unknown ledger");
      return;
    }
    if (!full.allowedLedgers.includes(mode)) {
      await answerCallbackQuery(botToken, queryId, "ခွင့်ပြုချက်မရှိပါ");
      return;
    }
    await prisma.telegramSender.update({ where: { id: sender.id }, data: { activeReportType: mode } });
    await answerCallbackQuery(botToken, queryId, `${ledgerLabel(mode)} selected`);
    await editTelegramMessage({
      botToken,
      chatId,
      messageId,
      text: `${getFormatPromptForMode(mode)}\n\n📷 photo ပို့လိုက်ပါ။`,
    });
    return;
  }

  if (data.startsWith("confirm:")) {
    await handleSubmitterConfirm(botToken, chatId, messageId, queryId, data.replace("confirm:", ""));
    return;
  }

  if (data.startsWith("reject:")) {
    await handleSubmitterReject(botToken, chatId, messageId, queryId, data.replace("reject:", ""));
    return;
  }

  await answerCallbackQuery(botToken, queryId, "OK");
}

// ─── Photo pipeline (runs in after()) ────────────────────────────────────────

async function recordIncomingMessage(chatId: string, messageId: number) {
  try {
    return await prisma.telegramMessage.create({
      data: { chatId, messageId, status: "received" },
    });
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) return null; // redelivery
    throw error;
  }
}

async function processPhoto(
  botToken: string,
  keys: string[],
  model: string,
  chatId: string,
  messageId: number,
  fileId: string,
  mode: LedgerType,
  updateProgress: (text: string) => Promise<void>,
) {
  const fail = async (text: string) => {
    await prisma.telegramMessage.updateMany({
      where: { chatId, messageId },
      data: { status: "failed", error: text },
    }).catch((error) => console.error("Failed to record extraction failure:", error));
    await updateProgress(text);
  };

  const downloaded = await downloadTelegramFile(botToken, fileId);
  if (!downloaded) return fail("❌ ပုံ download မရပါ။ ပြန်ပို့ပေးပါ။");

  if (!keys.length) return fail("❌ Extraction မပြင်ဆင်ရသေးပါ (admin ကို ဆက်သွယ်ပါ)။");

  // Image bytes are processed in memory only; never persisted to Storage.
  let main: Buffer;
  try {
    const pipeline = sharp(downloaded.buffer).rotate();
    main = await pipeline.clone().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
  } catch {
    return fail("❌ ပုံ process မရပါ။ JPG/PNG/WEBP ဖြင့် ပြန်ပို့ပါ။");
  }
  const base64 = main.toString("base64");

  const extracted = await extractByType(keys, model, base64, mode);
  if (extracted && "exhausted" in extracted) {
    // All keys failed retryably — tell staff WHY (quota vs overload vs bad
    // key) instead of a generic "try later". Detail chain is in Vercel logs.
    const failText: Record<ExtractReason, string> = {
      quota: "⏳ Gemini quota ပြည့်နေပါတယ်။ ခဏကြာမှ ပြန်ပို့ပေးပါ။",
      overloaded: "⏳ Model အလုပ်များနေပါတယ်။ ခဏကြာမှ ပြန်ပို့ပေးပါ။",
      key: "❌ API key မမှန်ပါ။ Admin ကို ဆက်သွယ်ပါ။",
      timeout: "❌ Extraction ယာယီမရပါ။ ခဏကြာမှ ပြန်စမ်းပါ။",
      unknown: "❌ Extraction ယာယီမရပါ။ ခဏကြာမှ ပြန်စမ်းပါ။",
      unavailable: "❌ Extraction ယာယီမရပါ။ ခဏကြာမှ ပြန်စမ်းပါ။",
    };
    await fail(failText[extracted.reason]);
    return;
  }
  if (extracted.terminal) {
    await fail("❌ ဒီပုံကို ဖတ်မရပါ။ ပုံကြည်အောင်ရိုက်ပြီး ပြန်ပို့ပါ။");
    return;
  }

  // Empty/wrong-mode results must not become replacements for approved data.
  if (extracted.flags.includes("response") || !hasLedgerContent(mode, extracted.lines)) {
    return fail(extractionEmptyMessage);
  }

  // Merge into the CONTENT date's report (upload date = fallback).
  const reportDate = resolveReportDate(extracted.contentDateText);
  const key = dateKey(reportDate);
  // Dashboard-only approval: every submit starts PENDING (no auto-confirm).

  // Stage extracted text and link metadata atomically; live lines are unchanged.
  const { report, added, skipped } = await prisma.$transaction(async (tx) => {
    const rep = await tx.dailyReport.upsert({
      where: { date: reportDate },
      create: { date: reportDate, status: "PENDING" },
      // Approval state belongs to the pending upload, not the existing report.
      update: {}, // Approved data remains visible until this upload is approved.
    });

    const message = await tx.telegramMessage.findUniqueOrThrow({ where: { chatId_messageId: { chatId, messageId } } });
    await tx.pendingUpload.create({ data: {
      id: message.id, reportId: rep.id, mode, status: "DRAFT", payload: JSON.parse(JSON.stringify(extracted)),
    } });
    const counts = { added: 0, skipped: 0 };
    await tx.sourceImage.create({
      data: {
        reportId: rep.id,
        ledgerType: mode.toUpperCase() as "REVENUE" | "EXPENSE" | "MAINTENANCE" | "FUEL" | "BRICK" | "INVENTORY",
        storagePath: null, // metadata only; no stored image
        thumbnailPath: null,
        telegramFileId: fileId,
        sizeBytes: main.length,
        rawText: extracted.rawText,
      },
    });
    await tx.telegramMessage.updateMany({
      where: { chatId, messageId },
      data: { reportId: rep.id, ledgerType: mode.toUpperCase() as "REVENUE" | "EXPENSE" | "MAINTENANCE" | "FUEL" | "BRICK" | "INVENTORY", status: "extracted" },
    });
    return { report: rep, ...counts };
  });

  const summaryMsg = await sendTelegramMessage({
    botToken,
    chatId,
    text: buildExtractPreviewMessage({
      summary: extracted.summary,
      dateKey: key,
      mode,
      lines: extracted.lines,
      unreadableFields: extracted.flags,
    }),
    replyMarkup: {
      inline_keyboard: [[
        { text: "✅ Confirm", callback_data: `confirm:${report.id}` },
        { text: "❌ Reject", callback_data: `reject:${report.id}` },
      ]],
    },
  });
  await updateProgress(summaryMsg ? processingCompleteMessage : processingFailedMessage);
  // Remember the bot's reply so approval flows can edit it in place later.
  if (summaryMsg) {
    await prisma.telegramMessage
      .updateMany({ where: { chatId, messageId }, data: { botReplyMessageId: summaryMsg.message_id } })
      .catch((error) => console.error("Failed to store bot reply id:", error));
  }
}


async function extractByType(
  keys: string[],
  model: string,
  base64: string,
  mode: LedgerType,
): Promise<(ExtractedPayload & { terminal?: false }) | { terminal: true } | { exhausted: true; reason: ExtractReason }> {
  const parts = (prompt: string) => [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: base64 } }];
  try {
    switch (mode) {
      case "inventory": {
        const { result } = await extractWithKeyRotation({ keys, model, diagnosticLabel: mode, parts: parts(inventoryPrompt()), parse: parseInventoryResponse });
        return {
          contentDateText: result.data.date, rawText: "", persistKind: mode,
          sheetKind: result.data.sheetKind, lines: result.data.rows,
          confidence: result.confidence, flags: result.unreadable_fields,
          summary: `📦 Inventory · ${result.data.sheetKind === "fuel" ? "Fuel" : "Materials"} — ${result.data.rows.length} rows`,
        };
      }
      case "revenue": {
        const { result } = await extractWithKeyRotation({ keys, model, diagnosticLabel: mode, parts: parts(revenuePrompt()), parse: parseRevenueResponse });
        const total = result.data.total || "—";
        return {
          contentDateText: result.data.date, rawText: "", persistKind: mode, lines: result.data.lines,
          confidence: result.confidence, flags: result.unreadable_fields,
          summary: `💰 Revenue — Total: <b>${escapeHtml(total)}</b> · ${result.data.lines.length} methods` +
            (result.unreadable_fields.includes("sum_mismatch") ? "\n⚠️ စုစုပေါင်းမကိုက် — dashboard မှာ စစ်ပါ" : ""),
        };
      }
      case "expense": {
        const { result } = await extractWithKeyRotation({ keys, model, diagnosticLabel: mode, parts: parts(expensePrompt()), parse: parseExpenseResponse });
        return {
          contentDateText: result.data.date, rawText: "", persistKind: mode,
          lines: { header: result.data, wages: result.data.wages },
          confidence: result.confidence, flags: result.unreadable_fields,
          summary: `💸 Expense — Total: <b>${escapeHtml(result.data.total || "—")}</b> · wages ${result.data.wages.length}`,
        };
      }
      case "maintenance": {
        const { result } = await extractWithKeyRotation({ keys, model, diagnosticLabel: mode, parts: parts(maintenancePrompt()), parse: parseMaintenanceResponse });
        return {
          contentDateText: result.data.date, rawText: "", persistKind: mode, lines: result.data.lines,
          confidence: result.confidence, flags: result.unreadable_fields,
          summary: `🔧 Maintenance — ${result.data.lines.length} lines`,
        };
      }
      case "fuel": {
        const { result } = await extractWithKeyRotation({ keys, model, diagnosticLabel: mode, parts: parts(fuelPrompt()), parse: parseFuelResponse });
        const bad = result.data.rows.filter((row: { balance_ok: boolean | null }) => row.balance_ok === false).length;
        return {
          contentDateText: result.data.rows[0]?.date ?? "", rawText: "", persistKind: mode, lines: result.data.rows,
          confidence: result.confidence, flags: result.unreadable_fields,
          summary: `⛽ Fuel — ${result.data.rows.length} rows` + (bad ? `\n⚠️ Balance mismatch × ${bad}` : ""),
        };
      }
      case "brick": {
        const { result } = await extractWithKeyRotation({ keys, model, diagnosticLabel: mode, parts: parts(brickPrompt()), parse: parseBrickResponse });
        const suspect =
          result.unreadable_fields.includes("row_count_suspect") ||
          result.unreadable_fields.includes("duplicate_rows");
        return {
          contentDateText: result.data.date, rawText: result.data.rawText, persistKind: mode, lines: result.data.rows,
          confidence: result.confidence, flags: result.unreadable_fields,
          summary: `🧱 Brick — ${result.data.rows.length} rows · confidence ${Math.round(result.confidence * 100)}%` +
            (result.data.rows.length === 0 ? "\n⚠️ စာမဖတ်နိုင်ပါ — dashboard မှာ ကိုယ်တိုင်ထည့်ပါ" : "") +
            (suspect ? "\n⚠️ အကြောင်းအရာများနေပါတယ် — dashboard မှာ စစ်ပေးပါ" : ""),
        };
      }
      default:
        return { terminal: true };
    }
  } catch (error) {
    // Log the underlying cause — Vercel function logs are the only way to
    // tell a deterministic failure (bad image/model) from a transient one.
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    if (error instanceof TerminalExtractError) {
      console.error(`extractByType[${mode}] failed:`, detail);
      return { terminal: true };
    }
    if (error instanceof RetryableExhaustedError) {
      const trail = error.attempts.map((a) => `#${a.slot}:${a.code}/${a.reason}`).join(" ");
      console.error(`extractByType[${mode}] failed:`, detail, `| keys tried: ${trail || "none"}`);
      return { exhausted: true as const, reason: dominantReason(error.attempts) };
    }
    console.error(`extractByType[${mode}] failed:`, detail);
    return { terminal: true };
  }
}

// ─── Persist lines ───
// Revenue/expense/maintenance are daily snapshots — each photo REPLACES that
// type's lines for the date. Fuel/brick are running tables — new rows are
// APPENDED and exact dupes skipped (retake-safe and multi-page-safe).
// Runs inside the submit $transaction; returns added/skipped counts.

// ─── Confirm / approve / reject ──────────────────────────────────────────────

async function handleSubmitterConfirm(
  botToken: string,
  chatId: number,
  messageId: number,
  queryId: string,
  reportId: string,
) {
  const report = await prisma.dailyReport.findUnique({
    where: { id: reportId },
    include: { telegramMessages: true },
  });
  if (!report) {
    await answerCallbackQuery(botToken, queryId, "Report not found");
    await editMessageButtons({ botToken, chatId, messageId });
    return;
  }
  const target = report.telegramMessages.find(m => m.chatId === String(chatId) && m.botReplyMessageId === messageId);
  if (!target) {
    await answerCallbackQuery(botToken, queryId, "Upload not found in this chat");
    return;
  }
  const pendingUpload = target ? await prisma.pendingUpload.findUnique({ where: { id: target.id } }) : null;
  if (pendingUpload && ["DRAFT", "PENDING"].includes(pendingUpload.status)) {
    const submitted = await prisma.$transaction(async tx => {
      const current = await tx.pendingUpload.findUnique({ where: { id: pendingUpload.id } });
      const message = await tx.telegramMessage.findUnique({ where: { id: pendingUpload.id } });
      if (!current || !["DRAFT", "PENDING"].includes(current.status) || message?.status !== "extracted") return false;
      await tx.pendingUpload.update({ where: { id: current.id }, data: { status: "PENDING" } });
      await tx.telegramMessage.update({ where: { id: current.id }, data: { status: "approval_requested" } });
      return true;
    }, { isolationLevel: "Serializable" });
    if (!submitted) {
      await answerCallbackQuery(botToken, queryId, "Already submitted or reviewed");
      return;
    }
    const edited = await editTelegramMessage({ botToken, chatId, messageId, text: waitingForApprovalMessage, replyMarkup: { inline_keyboard: [] } });
    if (!edited) {
      const waiting = await sendTelegramMessage({ botToken, chatId, text: waitingForApprovalMessage });
      if (waiting) {
        await prisma.telegramMessage.update({ where: { id: target!.id }, data: { botReplyMessageId: waiting.message_id } });
        await editMessageButtons({ botToken, chatId, messageId });
      }
    }
    await answerCallbackQuery(botToken, queryId, "Sent for approval");
    // Approval may finish while Telegram is editing the waiting message.
    const latest = await prisma.pendingUpload.findUnique({ where: { id: pendingUpload.id } });
    if (latest && ["CONFIRMED", "REJECTED"].includes(latest.status)) {
      await finalizeReportMessages({ botToken, reportId, approved: latest.status === "CONFIRMED", messageIds: [latest.id] });
    }
    return;
  }
  if (pendingUpload) {
    await answerCallbackQuery(botToken, queryId, "Already reviewed");
    await editMessageButtons({ botToken, chatId, messageId });
    return;
  }
  if (report.status === "CONFIRMED") {
    await answerCallbackQuery(botToken, queryId, "Already confirmed");
    await editMessageButtons({ botToken, chatId, messageId });
    return;
  }
  // Submitter confirm = request approval (reviewed in the dashboard queue).
  // Strip the button first so repeat taps can't spam ⏳ messages.
  await editMessageButtons({ botToken, chatId, messageId });
  const alreadyRequested = report.telegramMessages.length > 0 &&
    report.telegramMessages.every((message) => message.status === "approval_requested");
  if (alreadyRequested) {
    await answerCallbackQuery(botToken, queryId, "Already sent for approval");
    return;
  }
  await prisma.telegramMessage.updateMany({ where: { reportId }, data: { status: "approval_requested" } });
  await answerCallbackQuery(botToken, queryId, "Sent for approval");
  const waitingMsg = await sendTelegramMessage({ botToken, chatId, text: "⏳ Approver အတည်ပြုချက်စောင့်နေပါသည်။" });
  if (waitingMsg) {
    await prisma.telegramMessage
      .updateMany({ where: { reportId }, data: { botReplyMessageId: waitingMsg.message_id } })
      .catch((error) => console.error("Failed to store bot reply id:", error));
  }
}

/** The submitter can discard only their staged extraction; approved rows stay untouched. */
async function handleSubmitterReject(
  botToken: string,
  chatId: number,
  messageId: number,
  queryId: string,
  reportId: string,
) {
  const report = await prisma.dailyReport.findUnique({
    where: { id: reportId },
    include: { telegramMessages: true },
  });
  const target = report?.telegramMessages.find((message) =>
    message.chatId === String(chatId) && message.botReplyMessageId === messageId,
  );
  if (!target) {
    await answerCallbackQuery(botToken, queryId, "Upload not found in this chat");
    return;
  }

  const rejected = await prisma.$transaction(async (tx) => {
    const upload = await tx.pendingUpload.findUnique({ where: { id: target.id } });
    const message = await tx.telegramMessage.findUnique({ where: { id: target.id } });
    if (!upload || upload.status !== "DRAFT" || message?.status !== "extracted") return false;
    await tx.pendingUpload.update({ where: { id: target.id }, data: { status: "REJECTED" } });
    await tx.telegramMessage.update({ where: { id: target.id }, data: { status: "rejected" } });
    return true;
  }, { isolationLevel: "Serializable" });

  if (!rejected) {
    await answerCallbackQuery(botToken, queryId, "This upload was already submitted or reviewed");
    return;
  }
  await answerCallbackQuery(botToken, queryId, "Rejected");
  const edited = await editTelegramMessage({
    botToken,
    chatId,
    messageId,
    text: submitterRejectedMessage,
    replyMarkup: { inline_keyboard: [] },
  });
  if (!edited) await editMessageButtons({ botToken, chatId, messageId });
}
