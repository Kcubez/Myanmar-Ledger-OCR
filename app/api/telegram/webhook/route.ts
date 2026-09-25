import { NextRequest, NextResponse, after } from "next/server";
import sharp from "sharp";
import { prisma } from "../../../../lib/prisma";
import {
  sendTelegramMessage,
  answerCallbackQuery,
  editTelegramMessage,
  downloadTelegramFile,
  getFileInfoFromMessage,
} from "../../../../lib/telegram/client";
import {
  buildLedgerMenuButtons,
  getFormatPromptForMode,
  getLinkInstructions,
  ledgerLabel,
  escapeHtml,
} from "../../../../lib/telegram/templates";
import {
  upsertSender,
  isSenderAuthorized,
  getOwnerUserId,
  getApprovers,
  isPrismaUniqueConstraintError,
} from "../../../../lib/telegram/senders";
import { sendOTPEmail } from "../../../../lib/email";
import { uploadImage, storagePath, stagingPath, moveImage, deleteImage, bucketPath } from "../../../../lib/supabase";
import { dateKey, resolveReportDate, extractContentDate } from "../../../../lib/report-date";
import {
  parseKeyList,
  extractWithKeyRotation,
  RetryableExhaustedError,
  TerminalExtractError,
  amountFrom,
  isLedgerType,
  type LedgerType,
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
  });
  return false;
}

async function modeAccess(
  sender: { activeReportType: string; allowedLedgers: string[] },
  botToken: string,
  chatId: number,
): Promise<LedgerType | null> {
  const mode = sender.activeReportType;
  if (isLedgerType(mode) && sender.allowedLedgers.includes(mode)) return mode;
  await sendTelegramMessage({
    botToken,
    chatId,
    text: [
      "📋 <b>Ledger အမျိုးအစား ရွေးပါ</b>",
      "",
      sender.allowedLedgers.length
        ? "ခွင့်ပြုထားသော ledgers —"
        : "ခွင့်ပြုထားသော ledger မရှိသေးပါ။ admin ကို ဆက်သွယ်ပါ။",
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

    await sendTelegramMessage({ botToken, chatId, text: `📥 လက်ခံရရှိပါပြီ — ${ledgerLabel(mode)} စစ်ဆေးနေသည်…` });
    after(() =>
      processPhoto(botToken, runtime.keys, runtime.model, ownerUserId, sender.id, String(chatId), messageId, fileInfo.fileId, mode).catch(
        (error) => console.error("processPhoto failed:", error),
      ),
    );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}

// ─── Text commands ───────────────────────────────────────────────────────────

async function handleText(
  botToken: string,
  ownerUserId: string | null,
  sender: { id: string; otpCode: string | null; otpExpiresAt: Date | null; email: string | null },
  chatId: number,
  text: string,
) {
  // OTP entry: pending code + 6 digits.
  if (sender.otpCode && /^\d{6}$/.test(text)) {
    if (sender.otpCode !== text || !sender.otpExpiresAt || sender.otpExpiresAt < new Date()) {
      await sendTelegramMessage({ botToken, chatId, text: "❌ OTP မှားနေပါသည် သို့မဟုတ် သက်တမ်းကုန်ပါပြီ။ <code>/link email</code> ဖြင့် ပြန်တောင်းပါ။" });
      return;
    }
    // Inherit pre-registered scopes/approver flag from an admin-created row.
    // The placeholder (telegramUserId null) is consumed here so /settings
    // stops showing a stale PENDING duplicate next to the LINKED row.
    const pre = sender.email
      ? await prisma.telegramSender.findFirst({
          where: { email: sender.email, id: { not: sender.id }, userId: ownerUserId, telegramUserId: null },
        })
      : null;
    await prisma.telegramSender.update({
      where: { id: sender.id },
      data: {
        isVerified: true,
        isAuthorized: true,
        allowedLedgers: pre ? pre.allowedLedgers : [],
        isDataApprover: pre ? pre.isDataApprover : false,
        otpCode: null,
        otpExpiresAt: null,
      },
    });
    if (pre) {
      await prisma.telegramSender
        .deleteMany({
          where: { email: sender.email, userId: ownerUserId, telegramUserId: null },
        })
        .catch(() => undefined);
    }
    const updated = await prisma.telegramSender.findUnique({ where: { id: sender.id } });
    await sendTelegramMessage({
      botToken,
      chatId,
      text: ["✅ <b>ချိတ်ဆက်ပြီးပါပြီ!</b>", "", "Ledger ရွေးပြီး photo တင်နိုင်ပါပြီ —"].join("\n"),
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
        text: "📋 <b>Ledger ရွေးပါ —</b>",
        replyMarkup: buildLedgerMenuButtons(full.allowedLedgers),
      });
      return;
    }
    await sendTelegramMessage({
      botToken,
      chatId,
      text: ["🤖 <b>Ledger Bot</b> မှ ကြိုဆိုပါတယ်!", "", getLinkInstructions()].join("\n"),
    });
    return;
  }

  if (text === "/menu") {
    const full = await prisma.telegramSender.findUnique({ where: { id: sender.id } });
    if (!full || !(await gate(full, botToken, chatId))) return;
    await sendTelegramMessage({
      botToken,
      chatId,
      text: "📋 <b>Ledger ရွေးပါ —</b>",
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
      data: { isVerified: false, isAuthorized: false, otpCode: null, otpExpiresAt: null, activeReportType: "none" },
    });
    await sendTelegramMessage({ botToken, chatId, text: "🔓 အကောင့်ဖြုတ်လိုက်ပါပြီ။ ပြန်ချိတ်ရန် /start" });
    return;
  }

  if (text.startsWith("/link")) {
    const email = text.replace("/link", "").trim().toLowerCase();
    if (!/.+@.+\..+/.test(email)) {
      await sendTelegramMessage({ botToken, chatId, text: "📧 <code>/link your@email.com</code> ပုံစံဖြင့် ပို့ပေးပါ။" });
      return;
    }
    const otp = sixDigitOtp();
    await prisma.telegramSender.update({
      where: { id: sender.id },
      data: { email, otpCode: otp, otpExpiresAt: new Date(Date.now() + OTP_TTL_MS) },
    });
    const sent = await sendOTPEmail(email, otp);
    await sendTelegramMessage({
      botToken,
      chatId,
      text: sent
        ? `📨 <b>${escapeHtml(email)}</b> သို့ ၆ လုံး OTP ပို့ပြီးပါပြီ။ ဒီ chat ထဲမှာ ရိုက်ထည့်ပါ (၁၀ မိနစ်အတွင်း)။`
        : "❌ OTP email ပို့မရပါ။ နောက်မှ ပြန်စမ်းပါ။",
    });
    return;
  }

  await sendTelegramMessage({
    botToken,
    chatId,
    text: "Photo တင်ရန် — <code>/menu</code> မှ ledger ရွေး၊ ပြီးမှ photo ပို့ပါ။\nအကောင့်ချိတ်ရန် — <code>/link email</code>",
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
      text: "📋 <b>Ledger ရွေးပါ —</b>",
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
    if (!isLedgerType(mode)) {
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
    await handleSubmitterConfirm(botToken, sender, chatId, queryId, data.replace("confirm:", ""));
    return;
  }

  if (data.startsWith("approve:") || data.startsWith("reject:")) {
    const approve = data.startsWith("approve:");
    await handleApproval(botToken, sender, chatId, messageId, queryId, data.split(":")[1], approve);
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
  ownerUserId: string | null,
  senderId: string,
  chatId: string,
  messageId: number,
  fileId: string,
  mode: LedgerType,
) {
  const fail = async (text: string) => {
    await prisma.telegramMessage.updateMany({
      where: { chatId, messageId },
      data: { status: "failed", error: text },
    });
    await sendTelegramMessage({ botToken, chatId, text });
  };

  const downloaded = await downloadTelegramFile(botToken, fileId);
  if (!downloaded) return fail("❌ ပုံ download မရပါ။ ပြန်ပို့ပေးပါ။");

  if (!keys.length) return fail("❌ Extraction မပြင်ဆင်ရသေးပါ (admin ကို ဆက်သွယ်ပါ)။");

  // Compress: 1920px/q75 main + 400px/q60 thumb.
  let main: Buffer;
  let thumb: Buffer;
  try {
    const pipeline = sharp(downloaded.buffer).rotate();
    main = await pipeline.clone().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
    thumb = await pipeline.clone().resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 60 }).toBuffer();
  } catch {
    return fail("❌ ပုံ process မရပါ။ JPG/PNG/WEBP ဖြင့် ပြန်ပို့ပါ။");
  }
  const base64 = main.toString("base64");

  // Thumbnails-only policy (cost): the 1920px main lives in memory as the
  // Gemini payload and is discarded; only the ~7KB thumb hits Storage.
  const stagedThumbPath = stagingPath(chatId, mode, messageId, true);
  const [extracted, stagedThumb] = await Promise.all([
    extractByType(keys, model, base64, mode),
    uploadImage(stagedThumbPath, thumb, "image/jpeg"),
  ]);
  if (!extracted) {
    await prisma.telegramMessage.updateMany({ where: { chatId, messageId }, data: { status: "failed", error: "unavailable" } });
    await deleteImage(stagedThumbPath).catch(() => false);
    await sendTelegramMessage({ botToken, chatId, text: "❌ Extraction ယာယီမရပါ။ ခဏကြာမှ ပြန်စမ်းပါ။" });
    return;
  }
  if (extracted.terminal) {
    await prisma.telegramMessage.updateMany({ where: { chatId, messageId }, data: { status: "failed", error: "parse" } });
    await deleteImage(stagedThumbPath).catch(() => false);
    await sendTelegramMessage({ botToken, chatId, text: "❌ ဒီပုံကို ဖတ်မရပါ။ ပုံကြည်အောင်ရိုက်ပြီး ပြန်ပို့ပါ။" });
    return;
  }

  // Merge into the CONTENT date's report (upload date = fallback).
  const reportDate = resolveReportDate(extracted.contentDateText);
  const key = dateKey(reportDate);
  const sender = await prisma.telegramSender.findUnique({ where: { id: senderId } });
  const autoConfirm = sender?.isDataApprover === true;

  const thumbPath = storagePath(key, mode, messageId, true);
  // Move staging thumb → final content-date folder (server-side, no re-upload).
  // If the move fails, keep the staging location as the source of truth.
  let storedThumb: string | null = stagedThumb;
  if (stagedThumb && (await moveImage(stagedThumbPath, thumbPath).catch(() => false))) {
    storedThumb = bucketPath(thumbPath);
  }
  if (!storedThumb) return fail("❌ ပုံ save မရပါ (storage)။ Admin ကို ဆက်သွယ်ပါ။");

  const report = await prisma.dailyReport.upsert({
    where: { date: reportDate },
    create: { date: reportDate, status: autoConfirm ? "CONFIRMED" : "PENDING" },
    update: autoConfirm ? { status: "CONFIRMED" } : {},
  });

  await persistLines(report.id, mode, extracted, reportDate);
  await prisma.sourceImage.create({
    data: {
      reportId: report.id,
      ledgerType: mode.toUpperCase() as "REVENUE" | "EXPENSE" | "MAINTENANCE" | "FUEL" | "BRICK",
      storagePath: null, // thumbnails-only policy: full-size mains are discarded
      thumbnailPath: storedThumb,
      telegramFileId: fileId,
      sizeBytes: main.length,
      rawText: extracted.rawText,
    },
  });
  await prisma.telegramMessage.updateMany({
    where: { chatId, messageId },
    data: { reportId: report.id, ledgerType: mode.toUpperCase() as "REVENUE" | "EXPENSE" | "MAINTENANCE" | "FUEL" | "BRICK", status: "extracted" },
  });

  await sendTelegramMessage({
    botToken,
    chatId,
    text: `${extracted.summary}\n\n📅 ${key} report ${autoConfirm ? "✅ <b>CONFIRMED</b>" : "⏳ <b>PENDING</b> — အတည်ပြုရန် Confirm နှိပ်ပါ"}`,
    replyMarkup: autoConfirm
      ? undefined
      : { inline_keyboard: [[{ text: "✅ Confirm", callback_data: `confirm:${report.id}` }]] },
  });

  if (!autoConfirm && ownerUserId) {
    const approvers = await getApprovers(senderId, ownerUserId);
    await Promise.all(
      approvers
        .filter((approver: { telegramUserId: bigint | null }) => approver.telegramUserId !== null)
        .map((approver: { telegramUserId: bigint | null; id: string; displayName: string | null }) =>
          sendTelegramMessage({
            botToken,
            chatId: approver.telegramUserId!.toString(),
            text: `🔔 <b>Approval လိုအပ်နေသည်</b> — ${ledgerLabel(mode)} · 📅 ${key}\n${extracted.summary}`,
            replyMarkup: {
              inline_keyboard: [
                [
                  { text: "✅ Approve", callback_data: `approve:${report.id}` },
                  { text: "❌ Reject", callback_data: `reject:${report.id}` },
                ],
              ],
            },
          }),
        ),
    );
  }
}

type ExtractedPayload = {
  contentDateText: string;
  rawText: string;
  summary: string;
  persistKind: LedgerType;
  lines: unknown;
  confidence: number;
  flags: string[];
};

async function extractByType(
  keys: string[],
  model: string,
  base64: string,
  mode: LedgerType,
): Promise<(ExtractedPayload & { terminal?: false }) | { terminal: true } | null> {
  const parts = (prompt: string) => [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: base64 } }];
  try {
    switch (mode) {
      case "revenue": {
        const { result } = await extractWithKeyRotation({ keys, model, parts: parts(revenuePrompt()), parse: parseRevenueResponse });
        const total = result.data.total || "—";
        return {
          contentDateText: result.data.date, rawText: "", persistKind: mode, lines: result.data.lines,
          confidence: result.confidence, flags: result.unreadable_fields,
          summary: `💰 Revenue — Total: <b>${escapeHtml(total)}</b> · ${result.data.lines.length} methods` +
            (result.unreadable_fields.includes("sum_mismatch") ? "\n⚠️ စုစုပေါင်းမကိုက် — dashboard မှာ စစ်ပါ" : ""),
        };
      }
      case "expense": {
        const { result } = await extractWithKeyRotation({ keys, model, parts: parts(expensePrompt()), parse: parseExpenseResponse });
        return {
          contentDateText: result.data.date, rawText: "", persistKind: mode,
          lines: { header: result.data, wages: result.data.wages },
          confidence: result.confidence, flags: result.unreadable_fields,
          summary: `💸 Expense — Total: <b>${escapeHtml(result.data.total || "—")}</b> · wages ${result.data.wages.length}`,
        };
      }
      case "maintenance": {
        const { result } = await extractWithKeyRotation({ keys, model, parts: parts(maintenancePrompt()), parse: parseMaintenanceResponse });
        return {
          contentDateText: result.data.date, rawText: "", persistKind: mode, lines: result.data.lines,
          confidence: result.confidence, flags: result.unreadable_fields,
          summary: `🔧 Maintenance — ${result.data.lines.length} lines`,
        };
      }
      case "fuel": {
        const { result } = await extractWithKeyRotation({ keys, model, parts: parts(fuelPrompt()), parse: parseFuelResponse });
        const bad = result.data.rows.filter((row: { balance_ok: boolean | null }) => row.balance_ok === false).length;
        return {
          contentDateText: result.data.rows[0]?.date ?? "", rawText: "", persistKind: mode, lines: result.data.rows,
          confidence: result.confidence, flags: result.unreadable_fields,
          summary: `⛽ Fuel — ${result.data.rows.length} rows` + (bad ? `\n⚠️ Balance mismatch × ${bad}` : ""),
        };
      }
      case "brick": {
        const { result } = await extractWithKeyRotation({ keys, model, parts: parts(brickPrompt()), parse: parseBrickResponse });
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
    if (error instanceof TerminalExtractError) return { terminal: true };
    if (error instanceof RetryableExhaustedError) return null;
    return { terminal: true };
  }
}

// ─── Persist lines: each type's photos REPLACE that type's lines for the date ─

async function persistLines(reportId: string, mode: LedgerType, extracted: ExtractedPayload, reportDate: Date) {
  const big = (value: string): bigint => BigInt(Math.round(amountFrom(value)));
  switch (mode) {
    case "revenue": {
      const lines = extracted.lines as { method: string; amount: string }[];
      await prisma.revenueLine.deleteMany({ where: { reportId } });
      if (lines.length) {
        await prisma.revenueLine.createMany({
          data: lines.map((line) => ({
            reportId,
            method: line.method as "CASH" | "KBZ_PAY" | "MMQR" | "KBZ_SPECIAL" | "AYA_SPECIAL",
            amount: big(line.amount),
          })),
        });
      }
      const total = lines.reduce((sum, line) => sum + amountFrom(line.amount), 0);
      await prisma.dailyReport.update({ where: { id: reportId }, data: { totalRevenue: BigInt(Math.round(total)) } });
      break;
    }
    case "expense": {
      const payload = extracted.lines as {
        header: { business_drawing: string; personal_drawing: string; operation: string; total: string };
        wages: { name: string; role: string; amount: string }[];
      };
      await prisma.expenseLine.deleteMany({ where: { reportId } });
      const rows: { reportId: string; category: "BUSINESS_DRAWING" | "PERSONAL_DRAWING" | "OPERATION" | "WAGES"; name: string | null; role: string | null; amount: bigint }[] = [];
      if (payload.header.business_drawing) rows.push({ reportId, category: "BUSINESS_DRAWING", name: null, role: null, amount: big(payload.header.business_drawing) });
      if (payload.header.personal_drawing) rows.push({ reportId, category: "PERSONAL_DRAWING", name: null, role: null, amount: big(payload.header.personal_drawing) });
      if (payload.header.operation) rows.push({ reportId, category: "OPERATION", name: null, role: null, amount: big(payload.header.operation) });
      for (const wage of payload.wages) {
        rows.push({ reportId, category: "WAGES", name: wage.name || null, role: wage.role || null, amount: big(wage.amount) });
      }
      if (rows.length) await prisma.expenseLine.createMany({ data: rows });
      const total = rows.reduce((sum, row) => sum + Number(row.amount), 0);
      await prisma.dailyReport.update({ where: { id: reportId }, data: { totalExpense: BigInt(Math.round(total)) } });
      break;
    }
    case "maintenance": {
      const lines = extracted.lines as { vehicle: string; amount: string; part: string; vendor: string }[];
      await prisma.maintenanceLine.deleteMany({ where: { reportId } });
      if (lines.length) {
        await prisma.maintenanceLine.createMany({
          data: lines.map((line) => ({
            reportId, vehicle: line.vehicle, amount: big(line.amount),
            part: line.part || null, vendor: line.vendor || null,
          })),
        });
      }
      break;
    }
    case "fuel": {
      const rows = extracted.lines as { date: string; vehicle: string; particular: string; in_gal: string; out_gal: string; balance_gal: string; balance_ok: boolean | null }[];
      await prisma.fuelEntry.deleteMany({ where: { reportId } });
      if (rows.length) {
        // Ditto-fill: empty row dates inherit the nearest date above; the
        // report date is the last resort (never leave null on fresh rows).
        let carry: Date | null = null;
        await prisma.fuelEntry.createMany({
          data: rows.map((row) => {
            const parsed = row.date ? extractContentDate(row.date) : null;
            if (parsed) carry = parsed;
            return {
              reportId, vehicle: row.vehicle, particular: row.particular || null,
              date: carry ?? reportDate,
              inGal: row.in_gal ? amountFrom(row.in_gal) : null,
              outGal: row.out_gal ? amountFrom(row.out_gal) : null,
              balanceGal: row.balance_gal ? amountFrom(row.balance_gal) : null,
              balanceOk: row.balance_ok,
            };
          }),
        });
      }
      const totalIn = rows.reduce((sum, row) => sum + (row.in_gal ? amountFrom(row.in_gal) : 0), 0);
      const totalOut = rows.reduce((sum, row) => sum + (row.out_gal ? amountFrom(row.out_gal) : 0), 0);
      await prisma.dailyReport.update({ where: { id: reportId }, data: { totalFuelIn: totalIn, totalFuelOut: totalOut } });
      break;
    }
    case "brick": {
      const rows = extracted.lines as { date: string; item: string; qty: string; unit_price: string; amount: string }[];
      await prisma.brickEntry.deleteMany({ where: { reportId } });
      if (rows.length) {
        // Ditto-fill like fuel: empty row dates inherit the nearest date above.
        let carry: Date | null = null;
        await prisma.brickEntry.createMany({
          data: rows.map((row) => {
            const parsed = row.date ? extractContentDate(row.date) : null;
            if (parsed) carry = parsed;
            return {
              reportId, item: row.item,
              date: carry ?? reportDate,
              qty: row.qty ? amountFrom(row.qty) : null,
              unitPrice: row.unit_price ? big(row.unit_price) : null,
              amount: row.amount ? big(row.amount) : null,
            };
          }),
        });
      }
      break;
    }
  }
}

// ─── Confirm / approve / reject ──────────────────────────────────────────────

async function handleSubmitterConfirm(
  botToken: string,
  sender: { id: string; telegramUserId: bigint | null },
  chatId: number,
  queryId: string,
  reportId: string,
) {
  const report = await prisma.dailyReport.findUnique({
    where: { id: reportId },
    include: { telegramMessages: true },
  });
  if (!report) {
    await answerCallbackQuery(botToken, queryId, "Report not found");
    return;
  }
  if (report.status === "CONFIRMED") {
    await answerCallbackQuery(botToken, queryId, "Already confirmed");
    return;
  }
  const full = await prisma.telegramSender.findUnique({ where: { id: sender.id } });
  if (full?.isDataApprover && !isOwnSubmission(report.telegramMessages, sender.telegramUserId)) {
    await prisma.dailyReport.update({ where: { id: reportId }, data: { status: "CONFIRMED" } });
    await prisma.telegramMessage.updateMany({ where: { reportId }, data: { status: "confirmed" } });
    await answerCallbackQuery(botToken, queryId, "Confirmed");
    await sendTelegramMessage({ botToken, chatId, text: "✅ <b>CONFIRMED</b> — dashboard မှာ မြင်ရပါပြီ။" });
    return;
  }
  // Submitter confirm = request approval; approvers already notified at submit.
  await answerCallbackQuery(botToken, queryId, "Sent for approval");
  await sendTelegramMessage({ botToken, chatId, text: "⏳ Approver အတည်ပြုချက်စောင့်နေပါသည်။" });
}

function isOwnSubmission(
  messages: { chatId: string }[],
  approverTelegramId: bigint | null,
): boolean {
  if (!approverTelegramId || messages.length === 0) return false;
  return messages.every((message) => message.chatId === approverTelegramId.toString());
}

async function handleApproval(
  botToken: string,
  sender: { id: string; telegramUserId: bigint | null },
  chatId: number,
  messageId: number,
  queryId: string,
  reportId: string,
  approve: boolean,
) {
  const full = await prisma.telegramSender.findUnique({ where: { id: sender.id } });
  if (!full?.isDataApprover) {
    await answerCallbackQuery(botToken, queryId, "Approver permission required");
    return;
  }
  const report = await prisma.dailyReport.findUnique({
    where: { id: reportId },
    include: { telegramMessages: true },
  });
  if (!report || report.status !== "PENDING") {
    await answerCallbackQuery(botToken, queryId, "No longer pending");
    return;
  }
  if (isOwnSubmission(report.telegramMessages, sender.telegramUserId)) {
    await answerCallbackQuery(botToken, queryId, "You cannot approve your own submission");
    return;
  }

  await prisma.dailyReport.update({
    where: { id: reportId },
    data: { status: approve ? "CONFIRMED" : "NEEDS_REVIEW" },
  });
  await prisma.telegramMessage.updateMany({
    where: { reportId },
    data: { status: approve ? "confirmed" : "rejected" },
  });
  const label = approve ? "✅ <b>CONFIRMED</b>" : "❌ <b>REJECTED — ပြန်တင်ပေးပါ</b>";
  await editTelegramMessage({ botToken, chatId, messageId, text: `${label}\nReport: ${reportId}` });
  await answerCallbackQuery(botToken, queryId, approve ? "Approved" : "Rejected");

  // Notify the submitter chat(s).
  const chats = [...new Set(report.telegramMessages.map((message: { chatId: string }) => message.chatId))];
  await Promise.all(
    chats.map((target) =>
      sendTelegramMessage({ botToken, chatId: target, text: `${label}\nသင့်တင်ထားသော report.` }),
    ),
  );
}
