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
  return `${opts.summary}\n\n<b>Report date / စာရင်းရက်စွဲ:</b> ${escapeHtml(opts.dateKey)}\n${note}\n\n<b>Pending review </b>\nCheck the details, then tap Submit for review. Final approval happens in the dashboard.`;
}

export function getLinkInstructions(): string {  return [
    "🔗 ━━━━━━━━━━━━━━━━━━━━",
    "",
    "  <b>အကောင့်ချိတ်ဆက်ရန်</b>",
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    "  ① <code>/link your@email.com</code> ဟုပို့ပါ",
    "  ② email ထဲရောက်လာသော ၆ လုံး OTP ကို ရိုက်ပို့ပါ",
    "",
    "━━━━━━━━━━━━━━━━━━━━",
  ].join("\n");
}

export function escapeHtml(value: string | null | undefined): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const processingCompleteMessage = "✅ Extraction complete. Review the summary below.";
export const processingFailedMessage = "❌ Processing stopped. Please try again later; check Approvals before resending.";
export const waitingForApprovalMessage = "⏳ Submitted for review. Waiting for dashboard approval.";

export const extractionEmptyMessage = "⚠️ No usable rows found. Check the selected ledger type and resend a clear photo.";
