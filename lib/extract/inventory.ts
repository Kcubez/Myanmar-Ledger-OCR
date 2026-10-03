import { asText, normalizeDigits, parseJsonObject } from "./shared";

import { INVENTORY_CATEGORIES, INVENTORY_UNITS, type InventoryCategory } from "../inventory";
export { INVENTORY_CATEGORIES, INVENTORY_UNITS } from "../inventory";
export type InventoryRow = {
  category: InventoryCategory;
  particular: string;
  remark: string;
  unit: string;
  in: string;
  out: string;
  balance: string;
  balance_ok: boolean | null;
};
export type InventoryData = { date: string; sheetKind: "materials" | "fuel"; rows: InventoryRow[] };

/** Empty/illegible cells stay null; an explicit dash represents no movement. */
export function inventoryQuantity(value: string): number | null {
  const text = normalizeDigits(value).trim();
  if (/^[-–—]$/.test(text)) return 0;
  const match = text.match(/^(\d[\d,]*(?:\.\d{1,3})?)\s*(?:sud|sub|bags?|nos|gal(?:lons?)?|ကျင်း|လုံး|အိတ်)?$/i);
  if (!match) return null;
  const number = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(number) && number < 100_000_000_000 ? number : null;
}

export function inventoryPrompt(): string {
  return `Read this DAILY inventory sheet. Return ONLY JSON:
{"date":"date on page or empty","sheetKind":"materials or fuel","rows":[{"category":"sand|gravel|cement|brick|fuel","particular":"exact product/brand or vehicle/supplier name","remark":"written remark or empty; never invent","in":"source quantity or empty","out":"source quantity or empty","balance":"source quantity or empty"}]}
Materials sheet: keep every brand/variant (e.g. Cement D.R, Cement Alpha, Brick T.W, Brick one star) separate. Units are sand/gravel sud (source may say sub), cement bags, brick nos.
Fuel sheet: category fuel for ALL rows including supplier receipts. Particular is vehicle, ship, machine or supplier. Units gal. Preserve physical row order: balances are one shared tank's RUNNING balance, not per-vehicle stock. Include final receipt rows.
Copy each physical row ONCE. Preserve Myanmar text and numeric source strings. Do NOT calculate or invent missing amounts, opening stock, dates, names or brands. Blank/unclear cells = empty string; preserve explicit dashes. Do not treat faint erased writing as a readable value. Wrong document: rows empty. Never return old multi-day ledger data as a daily summary.`;
}

export function parseInventoryResponse(text: string): { data: InventoryData; confidence: number; unreadable_fields: string[] } {
  const empty: InventoryData = { date: "", sheetKind: "materials", rows: [] };
  try {
    const source = parseJsonObject(text);
    const flags: string[] = [];
    if (source.sheetKind !== "fuel" && source.sheetKind !== "materials") return { data: empty, confidence: 0, unreadable_fields: ["sheetKind"] };
    const sheetKind = source.sheetKind;
    const rows: InventoryRow[] = [];
    for (const [index, entry] of (Array.isArray(source.rows) ? source.rows : []).entries()) {
      if (!entry || typeof entry !== "object") { flags.push(`row_${index + 1}`); continue; }
      const r = entry as Record<string, unknown>;
      const category = asText(r.category).toLowerCase() as InventoryCategory;
      if (!INVENTORY_CATEGORIES.includes(category) || (sheetKind === "fuel") !== (category === "fuel")) {
        // Never silently drop an unclassified product from a replacement sheet.
        return { data: empty, confidence: 0, unreadable_fields: ["category"] };
      }
      const row: InventoryRow = { category, particular: asText(r.particular), remark: asText(r.remark), unit: INVENTORY_UNITS[category], in: asText(r.in), out: asText(r.out), balance: asText(r.balance), balance_ok: null };
      if (!row.particular) flags.push(`row_${index + 1}_particular`);
      for (const field of ["in", "out", "balance"] as const) {
        if ((row[field] && inventoryQuantity(row[field]) === null) || (field === "balance" && !row[field])) flags.push(`row_${index + 1}_${field}`);
      }
      rows.push(row);
    }
    if (sheetKind === "fuel") {
      let previous: number | null = null;
      for (const row of rows) {
        const balance = inventoryQuantity(row.balance);
        const incoming = row.in ? inventoryQuantity(row.in) : 0;
        const outgoing = row.out ? inventoryQuantity(row.out) : 0;
        if (previous !== null && balance !== null && incoming !== null && outgoing !== null) {
          row.balance_ok = Math.abs(previous + incoming - outgoing - balance) < 0.001;
          if (!row.balance_ok) flags.push("balance_mismatch");
        }
        previous = balance;
      }
    }
    const date = asText(source.date);
    if (!date) flags.push("date");
    if (!rows.length) flags.push("rows");
    return { data: { date, sheetKind, rows }, confidence: !rows.length ? 0 : flags.length ? 0.5 : 0.85, unreadable_fields: [...new Set(flags)] };
  } catch {
    return { data: empty, confidence: 0, unreadable_fields: ["response"] };
  }
}
