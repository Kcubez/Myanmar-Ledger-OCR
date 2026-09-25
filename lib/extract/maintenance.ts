import { asText, parseJsonObject } from "./shared";

/**
 * Maintenance ledger: vehicle/ship + amount + part.
 * The book table has 3 columns only — no vendor column.
 */

export type MaintenanceData = {
  date: string;
  lines: { vehicle: string; amount: string; part: string }[];
};

export type MaintenanceParseResult = {
  data: MaintenanceData;
  confidence: number;
  unreadable_fields: string[];
};

const EMPTY: MaintenanceData = { date: "", lines: [] };

export function maintenancePrompt(): string {
  return (
    `Extract the maintenance table from this ledger photo. Return ONLY valid JSON with this exact shape:\n` +
    `{"date":"report date or empty string",` +
    `"lines":[{"vehicle":"vehicle/ship id or empty","amount":"amount or empty","part":"part name or empty"}]}\n` +
    `Do not invent unclear values — use empty strings. Preserve source formats. ` +
    `Preserve Myanmar script verbatim — never transliterate.`
  );
}

export function parseMaintenanceResponse(text: string): MaintenanceParseResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = parseJsonObject(text);
  } catch {
    return { data: EMPTY, confidence: 0, unreadable_fields: ["response"] };
  }
  const raw = Array.isArray(parsed.lines) ? parsed.lines : [];
  const lines: MaintenanceData["lines"] = raw.map((entry) => {
    const row = (entry ?? {}) as Record<string, unknown>;
    return {
      vehicle: asText(row.vehicle),
      amount: asText(row.amount),
      part: asText(row.part),
    };
  });
  const data: MaintenanceData = { date: asText(parsed.date), lines };
  const unreadable: string[] = [];
  if (!data.date) unreadable.push("date");
  if (lines.length === 0) unreadable.push("lines");
  const confidence = lines.length === 0 ? 0.2 : 0.85;
  return { data, confidence, unreadable_fields: unreadable };
}

/** Heuristic fallback for typed text input. Never throws. */
export function parseMaintenanceMessage(text: string): MaintenanceParseResult {
  try {
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const dateMatch = text.match(/(?:date)\s*[:\-–]\s*(.+)/i);
    const data: MaintenanceData = { date: dateMatch?.[1]?.trim() ?? "", lines: [] };
    const pattern = /^(.+?)\s*[:\-–]\s*([\d,][\d,.\s]*)(?:\s*[:\-–]\s*(.+))?$/;
    for (const line of lines) {
      if (/^(date|maintenance)/i.test(line)) continue;
      const match = line.match(pattern);
      if (match) {
        data.lines.push({
          vehicle: match[1].trim(),
          amount: match[2].trim(),
          part: (match[3] ?? "").trim(),
        });
      }
    }
    return { data, confidence: 0.35, unreadable_fields: [] };
  } catch {
    return { data: EMPTY, confidence: 0, unreadable_fields: ["response"] };
  }
}
