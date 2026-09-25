import { amountFrom, asText, parseJsonObject } from "./shared";

/**
 * Revenue ledger: daily summary with fixed payment-method split.
 * Contract: never invents values; mismatches are flagged, not auto-fixed.
 */

export const REVENUE_METHODS = ["CASH", "KBZ_PAY", "MMQR", "KBZ_SPECIAL", "AYA_SPECIAL"] as const;
export type RevenueMethod = (typeof REVENUE_METHODS)[number];

export type RevenueData = {
  date: string;
  total: string;
  lines: { method: RevenueMethod; amount: string }[];
};

export type RevenueParseResult = {
  data: RevenueData;
  confidence: number;
  unreadable_fields: string[];
};

const EMPTY: RevenueData = { date: "", total: "", lines: [] };

export function revenuePrompt(): string {
  return (
    `Extract the daily revenue summary from this ledger photo. Return ONLY valid JSON with this exact shape:\n` +
    `{"date":"report date or empty string","total":"total revenue in source format or empty string",` +
    `"cash":"amount or empty","kbz_pay":"amount or empty","mmqr":"amount or empty",` +
    `"kbz_special":"amount or empty","aya_special":"amount or empty"}\n` +
    `Do not invent unclear values — use empty strings. Preserve source amount formats. ` +
    `Preserve Myanmar script verbatim — never transliterate.`
  );
}

const KEY_TO_METHOD: Record<string, RevenueMethod> = {
  cash: "CASH",
  kbz_pay: "KBZ_PAY",
  mmqr: "MMQR",
  kbz_special: "KBZ_SPECIAL",
  aya_special: "AYA_SPECIAL",
};

export function parseRevenueResponse(text: string): RevenueParseResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = parseJsonObject(text);
  } catch {
    return { data: EMPTY, confidence: 0, unreadable_fields: ["response"] };
  }
  const lines: RevenueData["lines"] = [];
  const unreadable: string[] = [];
  for (const [jsonKey, method] of Object.entries(KEY_TO_METHOD)) {
    const amount = asText(parsed[jsonKey]);
    if (amount) lines.push({ method, amount });
    else unreadable.push(jsonKey);
  }
  const data: RevenueData = { date: asText(parsed.date), total: asText(parsed.total), lines };
  if (!data.date) unreadable.push("date");
  if (!data.total) unreadable.push("total");
  // Sum check — flag only, never auto-correct.
  const total = amountFrom(data.total);
  const parts = lines.reduce((sum, line) => sum + amountFrom(line.amount), 0);
  const confidence = !data.total || lines.length === 0 ? 0.2 : total === parts ? 0.9 : 0.55;
  if (total !== parts) unreadable.push("sum_mismatch");
  return { data, confidence, unreadable_fields: unreadable };
}

/** Heuristic fallback for typed text input. Never throws. */
export function parseRevenueMessage(text: string): RevenueParseResult {
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
    const data: RevenueData = {
      date: pick([/(?:date)\s*[:\-–]\s*(.+)/i]),
      total: pick([/(?:total(?: revenue)?)\s*[:\-–]\s*([\d,.\s]+)/i]),
      lines: (
        [
          [/cash\s*[:\-–]\s*([\d,.\s]+)/i, "CASH"],
          [/kbz\s*pay\s*[:\-–]\s*([\d,.\s]+)/i, "KBZ_PAY"],
          [/mmqr\s*[:\-–]\s*([\d,.\s]+)/i, "MMQR"],
          [/kbz[^:\n]*special\s*[:\-–]\s*([\d,.\s]+)/i, "KBZ_SPECIAL"],
          [/aya[^:\n]*special\s*[:\-–]\s*([\d,.\s]+)/i, "AYA_SPECIAL"],
        ] as [RegExp, RevenueMethod][]
      )
        .map(([pattern, method]) => {
          for (const line of lines) {
            const match = line.match(pattern);
            if (match?.[1]?.trim()) return { method, amount: match[1].trim() };
          }
          return null;
        })
        .filter((line): line is { method: RevenueMethod; amount: string } => line !== null),
    };
    const filled = data.lines.length + (data.date ? 1 : 0) + (data.total ? 1 : 0);
    return { data, confidence: filled === 0 ? 0.1 : 0.35, unreadable_fields: [] };
  } catch {
    return { data: EMPTY, confidence: 0, unreadable_fields: ["response"] };
  }
}
