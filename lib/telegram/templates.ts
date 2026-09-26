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
  switch (mode) {
    case "revenue":
      return [
        "💰 ━━━━━━━━━━━━━━━━━━━━",
        "",
        "  <b>Revenue Mode — ဝင်ငွေ</b>",
        "",
        "━━━━━━━━━━━━━━━━━━━━",
        "",
        "ဒီနေ့ revenue summary စာမျက်နှာကို photo ရိုက်ပို့ပါ။",
        "Payment ခွဲချက်များ —",
        "<pre>",
        "Total Revenue",
        "Cash Income",
        "KBZ Pay",
        "MMQR",
        "KBZ Banking (Special)",
        "AYA Banking (Special)",
        "</pre>",
        "",
        "━━━━━━━━━━━━━━━━━━━━",
      ].join("\n");
    case "expense":
      return [
        "💸 ━━━━━━━━━━━━━━━━━━━━",
        "",
        "  <b>Expense Mode — ထွက်ငွေ (OPEX)</b>",
        "",
        "━━━━━━━━━━━━━━━━━━━━",
        "",
        "Expense + daily wages စာမျက်နှာကို photo ရိုက်ပို့ပါ။",
        "<pre>",
        "Total Expense",
        "Business Drawing",
        "Personal Drawing",
        "Operation Expense",
        "Drivers / Workers + amount",
        "</pre>",
        "",
        "━━━━━━━━━━━━━━━━━━━━",
      ].join("\n");
    case "maintenance":
      return [
        "🔧 ━━━━━━━━━━━━━━━━━━━━",
        "",
        "  <b>Maintenance Mode — ပြုပြင်ထိန်းသိမ်းမှု</b>",
        "",
        "━━━━━━━━━━━━━━━━━━━━",
        "",
        "Maintenance table ကို photo ရိုက်ပို့ပါ။",
        "<pre>",
        "Vehicle / Ship",
        "Amount",
        "Part (Gear Box, Engine oil…)",
        "</pre>",
        "",
        "━━━━━━━━━━━━━━━━━━━━",
      ].join("\n");
    case "fuel":
      return [
        "⛽ ━━━━━━━━━━━━━━━━━━━━",
        "",
        "  <b>Fuel Mode — ဆီ</b>",
        "",
        "━━━━━━━━━━━━━━━━━━━━",
        "",
        "Fuel ledger (Date | Particular | In | Out | Balance) ကို photo ရိုက်ပို့ပါ။",
        "လက်ရှိစာမျက်နှာအတိုင်း ပို့လို့ရပါတယ် — ရက်စွဲအလိုက် ပေါင်းထည့်ပေးမည်။",
        "",
        "━━━━━━━━━━━━━━━━━━━━",
      ].join("\n");
    case "brick":
      return [
        "🧱 ━━━━━━━━━━━━━━━━━━━━",
        "",
        "  <b>Brick Mode — အုတ်</b>",
        "",
        "━━━━━━━━━━━━━━━━━━━━",
        "",
        "Brick ledger စာမျက်နှာကို photo ရိုက်ပို့ပါ။",
        "လက်ရေးစာများ မရှင်းရင် dashboard မှာ ပြင်နိုင်ပါသည်။",
        "",
        "━━━━━━━━━━━━━━━━━━━━",
      ].join("\n");
    default:
      return [
        "🤖 ━━━━━━━━━━━━━━━━━━━━",
        "",
        "  <b>Ledger Bot</b>",
        "",
        "━━━━━━━━━━━━━━━━━━━━",
        "",
        "/menu မှ ledger အမျိုးအစားရွေးပြီးမှ photo တင်ပါ။",
        "",
        "━━━━━━━━━━━━━━━━━━━━",
      ].join("\n");
  }
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
  const note =
    opts.mode === "fuel" || opts.mode === "brick"
      ? `\n➕ စာကြောင်း ${opts.added} ကြောင်း ပေါင်းထည့်ပြီးပါပြီ${
          opts.skipped ? ` · ထပ်နေသော ${opts.skipped} ကြောင်း ကျော်ထားသည်` : ""
        }`
      : `\n📌 ယနေ့စာရင်းအဟောင်းရှိပါက ယခုတင်သောအသစ်ဖြင့် အစားထိုးမည်`;
  return (
    `${opts.summary}\n\n📅 ${opts.dateKey} နေ့စာရင်း · ⏳ Review စောင့်နေသည်` +
    ` — စစ်ပြီးရင် အောက်က Confirm ကိုနှိပ်ပါ${note}`
  );
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
