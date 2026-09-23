import { asText } from "./shared";

/**
 * Expense (OPEX) ledger: drawings + operation + daily wages breakdown.
 * Contract: never invents values; mismatches are flagged, not auto-fixed.
 */

export type ExpenseData = {
  date: string;
  total: string;
  business_drawing: string;
  personal_drawing: string;
  operation: string;
  wages: { name: string; role: string; amount: string }[];
};

export type ExpenseParseResult = {
  data: ExpenseData;
  confidence: number;
  unreadable_fields: string[];
};

const EMPTY: ExpenseData = {
  date: "",
  total: "",
  business_drawing: "",
  personal_drawing: "",
  operation: "",
  wages: [],
};

export function expensePrompt(): string {
  return (
    `Extract the daily expense (OPEX) summary from this ledger photo. Return ONLY valid JSON with this exact shape:\n` +
    `{"date":"report date or empty string","total":"total expense in source format or empty string",` +
    `"business_drawing":"amount or empty","personal_drawing":"amount or empty","operation":"operation expense or empty",` +
    `"wages":[{"name":"driver/worker name or vehicle id","role":"role or empty","amount":"amount or empty"}]}\n` +
    `Do not invent unclear values — use empty strings. Preserve source amount formats.`
  );
}

export function parseExpenseResponse(text: string): ExpenseParseResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, "")) as Record<string, unknown>;
  } catch {
    return { data: EMPTY, confidence: 0, unreadable_fields: ["response"] };
  }
  const wagesRaw = Array.isArray(parsed.wages) ? parsed.wages : [];
  const wages: ExpenseData["wages"] = wagesRaw.map((entry) => {
    const row = (entry ?? {}) as Record<string, unknown>;
    return { name: asText(row.name), role: asText(row.role), amount: asText(row.amount) };
  });
  const data: ExpenseData = {
    date: asText(parsed.date),
    total: asText(parsed.total),
    business_drawing: asText(parsed.business_drawing),
    personal_drawing: asText(parsed.personal_drawing),
    operation: asText(parsed.operation),
    wages,
  };
  const unreadable: string[] = [];
  if (!data.date) unreadable.push("date");
  if (!data.total) unreadable.push("total");
  if (!data.business_drawing) unreadable.push("business_drawing");
  if (!data.personal_drawing) unreadable.push("personal_drawing");
  const confidence = !data.total && wages.length === 0 ? 0.2 : unreadable.length <= 2 ? 0.85 : 0.55;
  return { data, confidence, unreadable_fields: unreadable };
}

/** Heuristic fallback for typed text input. Never throws. */
export function parseExpenseMessage(text: string): ExpenseParseResult {
  try {
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const pick = (patterns: RegExp[]): string => {
      for (const line of lines) {
        for (const pattern of patterns) {
          const match = line.match(pattern);
          if (match?.[1]) return match[1].trim();
        }
      }
      return "";
    };
    const data: ExpenseData = {
      date: pick([/(?:date)\s*[:\-–]\s*(.+)/i]),
      total: pick([/(?:total(?: expense)?)\s*[:\-–]\s*([\d,.\s]+)/i]),
      business_drawing: pick([/business[^\n:]*drawing\s*[:\-–]\s*([\d,.\s]+)/i]),
      personal_drawing: pick([/personal[^\n:]*drawing\s*[:\-–]\s*([\d,.\s]+)/i]),
      operation: pick([/operat\w*\s*(?:expense)?\s*[:\-–]\s*([\d,.\s]+)/i]),
      wages: [],
    };
    const wagePattern = /^(.+?)\s*[:\-–]\s*([\d,][\d,.\s]*)$/;
    for (const line of lines) {
      if (/driver|loader|worker|operator|purchaser/i.test(line)) {
        const match = line.match(wagePattern);
        if (match) data.wages.push({ name: match[1].trim(), role: "", amount: match[2].trim() });
      }
    }
    return { data, confidence: 0.35, unreadable_fields: [] };
  } catch {
    return { data: EMPTY, confidence: 0, unreadable_fields: ["response"] };
  }
}
