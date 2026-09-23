import { amountFrom, asText } from "./shared";

/**
 * Legacy 5-column dashboard extraction (date | revenue | expense | profit | loss).
 * Preserved verbatim from the original /api/extract route so the current
 * IndexedDB dashboard keeps working until it is replaced by the Supabase
 * dashboard. New Telegram flows use the per-type parsers instead.
 */

export const LEGACY_COLUMNS = ["နေ့စွဲ", "ဝင်ငွေ", "ထွက်ငွေ", "အမြတ်", "အရှုံး"];

type ExtractedRow = { date?: unknown; revenue?: unknown; expense?: unknown };

export function legacyPrompt(): string {
  return (
    `Extract only financial ledger rows from this Myanmar handwritten document. Return ONLY valid JSON with this exact shape:\n` +
    `{"rawText":"all legible source text","rows":[{"date":"source date or empty string","revenue":"income amount in source format or empty string","expense":"expense amount in source format or empty string"}]}\n` +
    `Never return any other row fields or keys. Ignore unsupported document columns such as balance, customer name, payment method, category, account number, or notes. Do not invent unclear values. Preserve source date and amount formats. A row may have revenue, expense, or both empty only when the document is unclear.`
  );
}

function calculatedValues(revenue: string, expense: string): { profit: string; loss: string } {
  if (!revenue && !expense) return { profit: "", loss: "" };
  const value = amountFrom(revenue) - amountFrom(expense);
  const currency = /ကျပ်|kyat|mmk/i.test(`${revenue} ${expense}`) ? " ကျပ်" : "";
  if (value >= 0) return { profit: `${value.toLocaleString("en-US")}${currency}`, loss: "" };
  return { profit: "", loss: `${Math.abs(value).toLocaleString("en-US")}${currency}` };
}

function cleanRows(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  return value.map((entry: ExtractedRow) => {
    const row = (entry ?? {}) as ExtractedRow;
    const date = asText(row?.date);
    const revenue = asText(row?.revenue);
    const expense = asText(row?.expense);
    const { profit, loss } = calculatedValues(revenue, expense);
    return [date, revenue, expense, profit, loss];
  });
}

export type LegacyParseResult = { rawText: string; columns: string[]; rows: string[][] };

export function parseLegacyResponse(text: string): LegacyParseResult {
  const parsed: unknown = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ""));
  const data = parsed as { rawText?: unknown; rows?: unknown };
  return {
    rawText: typeof data.rawText === "string" ? data.rawText : "",
    columns: LEGACY_COLUMNS,
    rows: cleanRows(data.rows),
  };
}
