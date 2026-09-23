import { asText } from "./shared";

/**
 * Brick ledger: Myanmar handwriting, hardest OCR target.
 * rawText is ALWAYS preserved as fallback even when rows parse.
 */

export type BrickData = {
  rawText: string;
  rows: { item: string; qty: string; unit_price: string; amount: string }[];
};

export type BrickParseResult = {
  data: BrickData;
  confidence: number;
  unreadable_fields: string[];
};

const EMPTY: BrickData = { rawText: "", rows: [] };

export function brickPrompt(): string {
  return (
    `Extract the brick/material ledger table from this photo (may be Myanmar handwriting). ` +
    `Return ONLY valid JSON with this exact shape:\n` +
    `{"rawText":"all legible source text or empty string",` +
    `"rows":[{"item":"item name as written or empty","qty":"quantity or empty",` +
    `"unit_price":"unit price or empty","amount":"line amount or empty"}]}\n` +
    `Do not invent unclear values — use empty strings. Preserve source formats.`
  );
}

export function parseBrickResponse(text: string): BrickParseResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, "")) as Record<string, unknown>;
  } catch {
    return { data: EMPTY, confidence: 0, unreadable_fields: ["response"] };
  }
  const raw = Array.isArray(parsed.rows) ? parsed.rows : [];
  const rows: BrickData["rows"] = raw.map((entry) => {
    const row = (entry ?? {}) as Record<string, unknown>;
    return {
      item: asText(row.item),
      qty: asText(row.qty),
      unit_price: asText(row.unit_price),
      amount: asText(row.amount),
    };
  });
  const data: BrickData = { rawText: asText(parsed.rawText), rows };
  const unreadable: string[] = [];
  if (!data.rawText) unreadable.push("rawText");
  if (rows.length === 0) unreadable.push("rows");
  // Handwriting: cap confidence below typed-clean ledgers.
  const confidence = rows.length === 0 ? 0.2 : data.rawText ? 0.7 : 0.45;
  return { data, confidence, unreadable_fields: unreadable };
}

/** Heuristic fallback for typed text input. Never throws. */
export function parseBrickMessage(text: string): BrickParseResult {
  try {
    const rows: BrickData["rows"] = [];
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = trimmed.match(/^(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*$/);
      if (match) {
        rows.push({
          item: (match[1] ?? "").trim(),
          qty: (match[2] ?? "").trim(),
          unit_price: (match[3] ?? "").trim(),
          amount: (match[4] ?? "").trim(),
        });
      }
    }
    return { data: { rawText: text.trim(), rows }, confidence: 0.35, unreadable_fields: [] };
  } catch {
    return { data: EMPTY, confidence: 0, unreadable_fields: ["response"] };
  }
}
