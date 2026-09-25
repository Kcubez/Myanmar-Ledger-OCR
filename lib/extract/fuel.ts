import { amountFrom, asText } from "./shared";

/**
 * Fuel ledger: Date | Particular | In | Out | Balance (gallons).
 * Running-balance check flags rows but never rewrites extracted values.
 */

export type FuelData = {
  rows: {
    date: string;
    vehicle: string;
    particular: string;
    in_gal: string;
    out_gal: string;
    balance_gal: string;
    balance_ok: boolean | null;
  }[];
};

export type FuelParseResult = {
  data: FuelData;
  confidence: number;
  unreadable_fields: string[];
};

export function fuelPrompt(): string {
  return (
    `Extract the fuel ledger table from this photo. Return ONLY valid JSON with this exact shape:\n` +
    `{"rows":[{"date":"source date or empty","vehicle":"vehicle id like Loader, 5K, 10', 2A or empty",` +
    `"particular":"particular text or empty","in_gal":"gallons in or empty","out_gal":"gallons out or empty",` +
    `"balance_gal":"running balance or empty"}]}\n` +
    `Preserve source formats (e.g. "5 gal"). Do not invent unclear values. ` +
    `Preserve Myanmar script verbatim — never transliterate.`
  );
}

export function parseFuelResponse(text: string): FuelParseResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, "")) as Record<string, unknown>;
  } catch {
    return { data: { rows: [] }, confidence: 0, unreadable_fields: ["response"] };
  }
  const raw = Array.isArray(parsed.rows) ? parsed.rows : [];
  const rows: FuelData["rows"] = raw.map((entry) => {
    const row = (entry ?? {}) as Record<string, unknown>;
    return {
      date: asText(row.date),
      vehicle: asText(row.vehicle),
      particular: asText(row.particular),
      in_gal: asText(row.in_gal),
      out_gal: asText(row.out_gal),
      balance_gal: asText(row.balance_gal),
      balance_ok: null,
    };
  });
  checkFuelBalance(rows);
  const unreadable: string[] = [];
  if (rows.length === 0) unreadable.push("rows");
  if (rows.some((row) => row.balance_ok === false)) unreadable.push("balance_mismatch");
  const confidence = rows.length === 0 ? 0.2 : unreadable.includes("balance_mismatch") ? 0.55 : 0.85;
  return { data: { rows }, confidence, unreadable_fields: unreadable };
}

/**
 * Verify running balances in order: balance[n] should equal
 * balance[n-1] + in[n] - out[n]. Marks each row; rows without
 * enough data keep balance_ok = null.
 */
export function checkFuelBalance(rows: FuelData["rows"]): void {
  let previous: number | null = null;
  for (const row of rows) {
    const inGal = row.in_gal ? amountFrom(row.in_gal) : 0;
    const outGal = row.out_gal ? amountFrom(row.out_gal) : 0;
    const balance = row.balance_gal ? amountFrom(row.balance_gal) : NaN;
    if (Number.isNaN(balance) || (previous === null && !row.in_gal && !row.out_gal)) {
      row.balance_ok = row.balance_gal ? null : null;
      if (!Number.isNaN(balance)) previous = balance;
      continue;
    }
    if (previous === null) {
      previous = balance;
      row.balance_ok = null;
      continue;
    }
    const expected = previous + inGal - outGal;
    row.balance_ok = Math.abs(expected - balance) < 0.01;
    previous = balance;
  }
}

/** Heuristic fallback for typed text input. Never throws. */
export function parseFuelMessage(text: string): FuelParseResult {
  try {
    const rows: FuelData["rows"] = [];
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = trimmed.match(
        /^(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*$/,
      );
      if (match) {
        rows.push({
          date: (match[1] ?? "").trim(),
          vehicle: (match[2] ?? "").trim(),
          particular: "",
          in_gal: (match[3] ?? "").trim(),
          out_gal: (match[4] ?? "").trim(),
          balance_gal: (match[5] ?? "").trim(),
          balance_ok: null,
        });
      }
    }
    checkFuelBalance(rows);
    return { data: { rows }, confidence: 0.35, unreadable_fields: [] };
  } catch {
    return { data: { rows: [] }, confidence: 0, unreadable_fields: ["response"] };
  }
}
