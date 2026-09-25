import { asText } from "./shared";

/**
 * Brick ledger: Myanmar handwriting, hardest OCR target.
 * rawText is ALWAYS preserved as fallback even when rows parse.
 */

export type BrickData = {
  rawText: string;
  /** Content date as written on the page (e.g. "15/9/2026"), or empty. */
  date: string;
  rows: { date: string; item: string; qty: string; unit_price: string; amount: string }[];
};

export type BrickParseResult = {
  data: BrickData;
  confidence: number;
  unreadable_fields: string[];
};

const EMPTY: BrickData = { rawText: "", date: "", rows: [] };

/** A brick page rarely holds more than ~20 legible rows; above that Gemini
 *  is usually duplicating or hallucinating lines. */
const MAX_PLAUSIBLE_ROWS = 25;

export function brickPrompt(): string {
  return (
    `Extract the brick/material ledger table from this photo (may be Myanmar handwriting). ` +
    `Return ONLY valid JSON with this exact shape:\n` +
    `{"rawText":"all legible source text or empty string",` +
    `"date":"content date as written on the page (e.g. 15/9/2026) or empty string",` +
    `"rows":[{"date":"row date as written (ditto marks mean same date as the row above) or empty",` +
    `"item":"item name as written or empty","qty":"quantity or empty",` +
    `"unit_price":"unit price or empty","amount":"line amount or empty"}]}\n` +
    `List each physical row ONCE — never repeat or split rows to inflate the count. ` +
    `Do not invent unclear values — use empty strings. Preserve source formats. ` +
    `Preserve Myanmar script verbatim — never transliterate.`
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
  const rows: BrickData["rows"] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  for (const entry of raw) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const candidate = {
      date: asText(row.date),
      item: asText(row.item),
      qty: asText(row.qty),
      unit_price: asText(row.unit_price),
      amount: asText(row.amount),
    };
    const key = `${candidate.date}|${candidate.item}|${candidate.qty}|${candidate.unit_price}|${candidate.amount}`;
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    rows.push(candidate);
  }
  const data: BrickData = { rawText: asText(parsed.rawText), date: asText(parsed.date), rows };
  const unreadable: string[] = [];
  if (!data.rawText) unreadable.push("rawText");
  if (rows.length === 0) unreadable.push("rows");
  if (duplicates > 0) unreadable.push("duplicate_rows");
  if (rows.length > MAX_PLAUSIBLE_ROWS) unreadable.push("row_count_suspect");
  // Handwriting: cap confidence below typed-clean ledgers; suspect counts cap harder.
  let confidence = rows.length === 0 ? 0.2 : data.rawText ? 0.7 : 0.45;
  if (unreadable.includes("row_count_suspect")) confidence = Math.min(confidence, 0.4);
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
          date: "",
          item: (match[1] ?? "").trim(),
          qty: (match[2] ?? "").trim(),
          unit_price: (match[3] ?? "").trim(),
          amount: (match[4] ?? "").trim(),
        });
      }
    }
    return { data: { rawText: text.trim(), date: "", rows }, confidence: 0.35, unreadable_fields: [] };
  } catch {
    return { data: EMPTY, confidence: 0, unreadable_fields: ["response"] };
  }
}
