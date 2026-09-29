/**
 * Telegram message templates, format prompts, and menu builders.
 * Pure string builders — no database, network, or request access.
 * User-facing copy is bilingual (English + Burmese) by design.
 */
import { LEDGER_TYPES, type LedgerType } from "../extract";

export const LEDGER_LABELS: Record<LedgerType, { emoji: string; en: string; mm: string }> = {
  revenue: { emoji: "💰", en: "Revenue", mm: "ဝင်ငွေ" },
  expense: { emoji: "💸", en: "Expense (OPEX)", mm: "ထွက်ငွေ" },
  maintenance: { emoji: "🔧", en: "Maintenance", mm: "ပြုပြင်ထိန်းသိမ်းမှု" },
  fuel: { emoji: "⛽", en: "Fuel", mm: "ဆီ" },
  brick: { emoji: "🧱", en: "Brick", mm: "အုတ်" },
};

export function ledgerLabel(mode: LedgerType): string {
  const info = LEDGER_LABELS[mode];
  return `${info.emoji} ${info.en} (${info.mm})`;
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
  if (!mode) return "<b>Ledger Bot</b>\nChoose a ledger from /menu, then send a clear photo.\n/menu မှ စာရင်းအမျိုးအစားရွေးပြီး ကြည်လင်သောပုံ ပို့ပါ။";
  const instructions: Record<LedgerType, string> = {
    revenue: "Include the total and all payment methods.\nစုစုပေါင်းနှင့် ငွေပေးချေမှုခွဲချက်အားလုံး ပါအောင်ပို့ပါ။",
    expense: "Include BOTH the expense summary and labour details in one photo. Labour details are part of the subtotal, not an extra charge.\nအပေါ်ကအနှစ်ချုပ်နှင့် အောက်ကလုပ်အားခအသေးစိတ် နှစ်ပိုင်းလုံးပါအောင် ပို့ပါ။ လုပ်အားခကို နှစ်ခါမပေါင်းပါ။",
    maintenance: "Include date, vehicle/ship, amount and repair item.\nရက်စွဲ၊ ယာဉ်/သင်္ဘော၊ ငွေပမာဏနှင့် ပြုပြင်သည့်ပစ္စည်း ပါအောင်ပို့ပါ။",
    fuel: "Send each page in order, including Date, Particular, In, Out and Balance. Multiple photos are accepted.\nရက်စွဲ၊ အကြောင်းအရာ၊ အဝင်၊ အထွက်၊ လက်ကျန် ပါအောင် စာမျက်နှာအစဉ်လိုက် ပို့ပါ။ ပုံများစွာ တင်နိုင်ပါသည်။",
    brick: "Include column headings and all rows. Unclear handwriting needs dashboard review.\nခေါင်းစဉ်နှင့် စာကြောင်းအားလုံး ပါအောင်ပို့ပါ။ မရှင်းသောလက်ရေးကို dashboard တွင် စစ်ဆေးပါ။",
  };
  return `<b>${ledgerLabel(mode)}</b>\n\n${instructions[mode]}\n\nKeep the page flat and well lit.\nစာမျက်နှာကို ပြန့်ပြန့်ထားပြီး အလင်းကောင်းကောင်းဖြင့် ရိုက်ပါ။`;
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
  const note = opts.mode === "fuel" || opts.mode === "brick"
    ? "Rows will be merged after approval; duplicates will be skipped.\nအတည်ပြုပြီးမှ စာကြောင်းအသစ်များ ပေါင်းထည့်ပါမည်။"
    : "After approval, this upload replaces the same ledger for this report date. Approved data remains visible until then.\nအတည်ပြုပြီးမှ ရက်စွဲတူ၊ အမျိုးအစားတူစာရင်းကို အစားထိုးပါမည်။";
  return `${opts.summary}\n\n<b>Report date / စာရင်းရက်စွဲ:</b> ${escapeHtml(opts.dateKey)}\n${note}\n\n<b>Pending review / စစ်ဆေးရန်စောင့်နေသည်</b>\nCheck the details, then tap Submit for review. Final approval happens in the dashboard.\nအချက်အလက်စစ်ပြီး စစ်ဆေးရန်ပို့မည် ကိုနှိပ်ပါ။ နောက်ဆုံးအတည်ပြုခြင်းကို dashboard မှ လုပ်ပါမည်။`;
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

export const processingCompleteMessage = "✅ Extraction complete. Review the summary below.\nပုံဖတ်ပြီးပါပြီ။ အောက်ပါအချက်အလက်များကို စစ်ဆေးပေးပါ။";
export const processingFailedMessage = "❌ Processing stopped. Please try again later; check Approvals before resending.\nလုပ်ဆောင်မှု ရပ်သွားပါပြီ။ ပြန်မပို့မီ Approvals ကို စစ်ကြည့်ပြီး ခဏကြာမှ ပြန်စမ်းပါ။";
export const waitingForApprovalMessage = "⏳ Submitted for review. Waiting for dashboard approval.\nစစ်ဆေးရန် ပို့ပြီးပါပြီ။ Dashboard မှ အတည်ပြုချက်ကို စောင့်နေပါသည်။";
