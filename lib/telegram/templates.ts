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
export function buildExtractPreviewMessage(opts: {
  summary: string;
  dateKey: string;
  mode: LedgerType;
  lines: unknown;
  unreadableFields: string[];
}): string {
  const rows = Array.isArray(opts.lines) ? opts.lines : [];
  // Bound each source field before escaping it. This keeps the complete HTML
  // structure intact (unlike slicing an already-formatted Telegram message).
  const value = (input: unknown) => {
    const raw = String(input ?? "").trim() || "—";
    return escapeHtml(raw.length > 48 ? `${raw.slice(0, 47)}…` : raw);
  };
  const showRows = (items: unknown[], makeLine: (row: Record<string, unknown>) => string) => {
    const visible = items.slice(0, 8).map((row) => makeLine((row && typeof row === "object" ? row : {}) as Record<string, unknown>));
    const more = items.length > visible.length ? `\n… and ${items.length - visible.length} more row(s)` : "";
    return visible.length ? `${visible.join("\n")}${more}` : "—";
  };

  let details = "—";
  if (opts.mode === "inventory" || opts.mode === "fuel" || opts.mode === "brick") {
    details = showRows(rows, (row) => {
      const unit = value(row.unit);
      return `• <b>${value(row.category)}</b> · ${value(row.particular)}\n  In ${value(row.in)} · Out ${value(row.out)} · Balance ${value(row.balance)} ${unit}`;
    });
  } else if (opts.mode === "revenue") {
    details = showRows(rows, (row) => `• ${value(row.method)} — <b>${value(row.amount)} Ks</b>`);
  } else if (opts.mode === "maintenance") {
    details = showRows(rows, (row) => `• <b>${value(row.vehicle)}</b> · ${value(row.part)} — ${value(row.amount)} Ks`);
  } else if (opts.mode === "expense") {
    const data = opts.lines && typeof opts.lines === "object" ? opts.lines as Record<string, unknown> : {};
    const header = data.header && typeof data.header === "object" ? data.header as Record<string, unknown> : {};
    const wages = Array.isArray(data.wages) ? data.wages : [];
    details = [
      `• Total — <b>${value(header.total)} Ks</b>`,
      `• Business ${value(header.business_drawing)} · Personal ${value(header.personal_drawing)} · Operation ${value(header.operation)} Ks`,
      wages.length ? "<b>Wages</b>\n" + showRows(wages, (row) => `• ${value(row.name)} — ${value(row.amount)} Ks`) : "",
    ].filter(Boolean).join("\n");
  }

  const warning = opts.unreadableFields.length
    ? "\n\n⚠️ Some values may need review in the dashboard."
    : "";
  const reviewNote = opts.mode === "inventory"
    ? "This replaces only the matching same-date inventory sheet after dashboard approval."
    : "This replaces the matching same-date ledger after dashboard approval.";
  return [
    "<b>Extracted preview / ဖတ်ယူထားသောအချက်အလက်</b>",
    opts.summary,
    `<b>Date:</b> ${escapeHtml(opts.dateKey)}`,
    "",
    details,
    warning,
    "",
    reviewNote,
    "Confirm sends this upload to the dashboard for final approval.",
  ].join("\n");
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
