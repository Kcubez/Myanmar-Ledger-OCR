/**
 * Telegram message templates, format prompts, and menu builders.
 * Pure string builders — no database, network, or request access.
 * User-facing copy is bilingual (English + Burmese) by design.
 */
import { LEDGER_TYPES, type LedgerType } from "../extract";

export const LEDGER_LABELS: Record<LedgerType, { emoji: string; en: string; mm: string }> = {
  inventory: { emoji: "📦", en: "Inventory", mm: "ပစ္စည်းစာရင်း" },
  revenue: { emoji: "💰", en: "Revenue", mm: "ဝင်ငွေ" },
  expense: { emoji: "💸", en: "Expense (OPEX)", mm: "ထွက်ငွေ" },
  maintenance: { emoji: "🔧", en: "Maintenance", mm: "ပြုပြင်ထိန်းသိမ်းမှု" },
  fuel: { emoji: "⛽", en: "Fuel", mm: "ဆီ" },
  brick: { emoji: "🧱", en: "Brick", mm: "အုတ်" },
};

export function ledgerLabel(mode: LedgerType): string {
  const info = LEDGER_LABELS[mode];
  return `${info.emoji} ${info.en}`;
}

export function buildLedgerMenuButtons(allowedLedgers: string[]) {
  const buttons = LEDGER_TYPES.filter((type) => allowedLedgers.includes(type)).map((type) => [
    { text: ledgerLabel(type), callback_data: `mode:${type}` },
  ]);
  buttons.push([{ text: "↩️ Main menu", callback_data: "action:menu" }]);
  return { inline_keyboard: buttons };
}

export function buildMainMenuButtons() {
  return {
    inline_keyboard: [
      [
        { text: "📋 Ledger တင်ရန်", callback_data: "action:submit" },
        { text: "📖 Format ကြည့်ရန်", callback_data: "action:format" },
      ],
      [{ text: "↩️ Main menu", callback_data: "action:menu" }],
    ],
  };
}

/** A persistent command keyboard makes the account-linking entry point easy to find. */
export function buildLinkKeyboard() {
  return {
    keyboard: [[{ text: "/link" }]],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

export function getFormatPromptForMode(mode: LedgerType | null | undefined): string {
  if (!mode) return "<b>Ledger Bot</b>\nChoose a ledger from /menu, then send a clear photo.";
  const instructions: Record<LedgerType, string> = {
    inventory: "Send a daily materials or fuel summary with Date, Particular, In, Out and Balance.",
    revenue: "Include the total and all payment methods.",
    expense: "Include BOTH the expense summary and wage details in one photo.",
    maintenance: "Include date, vehicle/ship, amount and repair item.",
    fuel: "Send each page in order, including Date, Particular, In, Out and Balance. Multiple photos are accepted.",
    brick: "Include column headings and all rows. Unclear handwriting needs dashboard review.",
  };
  return `<b>${ledgerLabel(mode)}</b>\n\n${instructions[mode]}\n\nKeep the page flat and well lit.`;
}

/**
 * Post-extract summary message: per-type result line + pending-review notice.
 * Snapshot types (revenue/expense/maintenance) replace today's lines;
 * append types (fuel/brick) merge new rows — the note says which happened.
 */
export function buildExtractSummaryMessage(opts: {
  summary: string;
  dateKey: string;
  mode: LedgerType;
  added: number;
  skipped: number;
}): string {
  const note = opts.mode === "inventory"
    ? "After approval, this upload replaces the same date’s materials or fuel sheet. The other sheet stays unchanged."
    : opts.mode === "fuel" || opts.mode === "brick"
    ? "Rows will be merged after approval; duplicates will be skipped."
    : "After approval, this upload replaces the same ledger for this report date. Approved data remains visible until then.";
  return `${opts.summary}\n\n<b>Report date / စာရင်းရက်စွဲ:</b> ${escapeHtml(opts.dateKey)}\n${note}\n\n<b>Preview ready / စစ်ဆေးရန်</b>\nCheck the extracted details below, then confirm or reject this upload.`;
}

/**
 * Compact, human-readable extraction preview for Telegram.  It is deliberately
 * capped so Telegram's 4096 character message limit cannot hide the actions.
 */
type ExtractPreviewOptions = {
  summary: string;
  dateKey: string;
  mode: LedgerType;
  lines: unknown;
  unreadableFields: string[];
};

function previewQuantity(input: unknown, unit: string, value: (input: unknown) => string): string {
  const raw = String(input ?? "").trim();
  if (!raw || /^[-–—]$/.test(raw)) return "—";
  const withoutUnit = raw.replace(/\s*(?:sud|sub|bags?|nos|gal(?:lons?)?|ကျင်း|လုံး|အိတ်)\s*$/i, "").trim();
  return `${value(withoutUnit || raw)} ${unit}`;
}

function buildPreviewRows(opts: ExtractPreviewOptions, value: (input: unknown) => string): string[] {
  const rows = Array.isArray(opts.lines) ? opts.lines : [];
  if (opts.mode === "inventory" || opts.mode === "fuel" || opts.mode === "brick") {
    return rows.map((entry, index) => {
      const row = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
      const unit = value(row.unit);
      const title = opts.mode === "inventory" && String(row.category).toLowerCase() !== "fuel"
        ? `${value(row.particular)} <i>(${value(row.category)})</i>`
        : value(row.particular);
      const remark = String(row.remark ?? "").trim();
      return [
        `<b>${index + 1}. ${title}</b>`,
        `In: ${previewQuantity(row.in, unit, value)}   ·   Out: ${previewQuantity(row.out, unit, value)}`,
        `Balance: <b>${previewQuantity(row.balance, unit, value)}</b>`,
        remark ? `Remark: ${value(remark)}` : "",
      ].filter(Boolean).join("\n");
    });
  }
  if (opts.mode === "revenue") {
    return rows.map((entry, index) => {
      const row = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
      return `<b>${index + 1}. ${value(row.method)}</b>\nAmount: <b>${value(row.amount)} Ks</b>`;
    });
  }
  if (opts.mode === "maintenance") {
    return rows.map((entry, index) => {
      const row = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
      return `<b>${index + 1}. ${value(row.vehicle)}</b>\nMaintenance task: ${value(row.part)}\nAmount: <b>${value(row.amount)} Ks</b>`;
    });
  }
  if (opts.mode === "expense") {
    const data = opts.lines && typeof opts.lines === "object" ? opts.lines as Record<string, unknown> : {};
    const header = data.header && typeof data.header === "object" ? data.header as Record<string, unknown> : {};
    const wages = Array.isArray(data.wages) ? data.wages : [];
    return [
      `<b>Expense summary</b>\nTotal: <b>${value(header.total)} Ks</b>\nBusiness: ${value(header.business_drawing)} Ks\nPersonal: ${value(header.personal_drawing)} Ks\nOperation: ${value(header.operation)} Ks`,
      ...wages.map((entry, index) => {
        const wage = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
        return `<b>Wage ${index + 1}. ${value(wage.name)}</b>\nAmount: <b>${value(wage.amount)} Ks</b>`;
      }),
    ];
  }
  return ["—"];
}

export function buildExtractPreviewMessages(opts: ExtractPreviewOptions): string[] {
  // Bound each source field before escaping it. This keeps complete Telegram
  // HTML tags intact while still making every extracted row reviewable.
  const value = (input: unknown) => {
    const raw = String(input ?? "").trim() || "—";
    return escapeHtml(raw.length > 48 ? `${raw.slice(0, 47)}…` : raw);
  };
  const heading = [
    "<b>Review extracted data / ဖတ်ယူထားသောအချက်အလက်</b>",
    opts.summary,
    `<b>Date:</b> ${escapeHtml(opts.dateKey)}`,
  ].join("\n");
  const rows = buildPreviewRows(opts, value);
  const warning = opts.unreadableFields.length ? "⚠️ Some values may need review in the dashboard." : "";
  const reviewNote = opts.mode === "inventory"
    ? "This replaces only the matching same-date inventory sheet after dashboard approval."
    : "This replaces the matching same-date ledger after dashboard approval.";
  const footer = [warning, reviewNote, "Confirm sends this upload to the dashboard for final approval."].filter(Boolean).join("\n");
  const limit = 3400;
  const messages: string[] = [];
  let current = heading;
  for (const row of rows) {
    const next = `${current}\n\n${row}`;
    if (next.length > limit && current !== heading) {
      messages.push(current);
      current = `<b>Extracted data — continued</b>\n\n${row}`;
    } else {
      current = next;
    }
  }
  if (`${current}\n\n${footer}`.length > limit && current !== heading) {
    messages.push(current);
    current = "<b>Review extracted data — final</b>";
  }
  messages.push(`${current}\n\n${footer}`);
  return messages;
}

/** Convenience form used by unit tests and callers that need one short preview. */
export function buildExtractPreviewMessage(opts: ExtractPreviewOptions): string {
  return buildExtractPreviewMessages(opts)[0] ?? "";
}

export function getLinkInstructions(): string {
  return [
    "🔗 <b>Link your Ledger account</b>",
    "",
    "① Tap <code>/link</code> below",
    "② Send the email registered by your administrator",
    "③ Enter the 6-digit OTP sent to that email",
    "",
    "အကောင့်ချိတ်ရန် /link ကိုနှိပ်ပြီး admin စာရင်းသွင်းထားသော email နှင့် OTP ကို အဆင့်လိုက်ထည့်ပါ။",
  ].join("\n");
}

export function escapeHtml(value: string | null | undefined): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const processingCompleteMessage = "✅ Extraction complete. Review the preview below.";
export const processingFailedMessage = "❌ Processing stopped. Please try again later; check Approvals before resending.";
export const waitingForApprovalMessage = "⏳ Submitted for review. Waiting for dashboard approval.";
export const submitterRejectedMessage = "❌ Upload rejected. Please send a clearer photo when ready.\nပြန်တင်ရန် ပုံကြည်လင်အောင်ရိုက်ပြီး ပို့ပေးပါ။";

export const extractionEmptyMessage = "⚠️ No usable rows found. Check the selected ledger type and resend a clear photo.";
