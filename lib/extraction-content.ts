/** A date/summary alone is never a replacement ledger, including expense's object payload. */
export function hasLedgerContent(mode: string, lines: unknown): boolean {
  const amount = (value: unknown) => typeof value === "string" && /[0-9၀-၉]/.test(value);
  if (mode === "maintenance") {
    // A maintenance upload replaces the day's maintenance snapshot. Do not
    // allow a partially unreadable amount to erase an approved value as 0.
    return Array.isArray(lines) && lines.length > 0 && lines.every(row =>
      !!row && typeof row === "object" &&
      typeof (row as { vehicle?: unknown }).vehicle === "string" && !!(row as { vehicle: string }).vehicle.trim() &&
      amount((row as { amount?: unknown }).amount),
    );
  }
  if (mode !== "expense") return Array.isArray(lines) && lines.length > 0;
  if (!lines || typeof lines !== "object" || Array.isArray(lines)) return false;
  const { header, wages } = lines as { header?: Record<string, unknown>; wages?: { amount?: unknown }[] };
  return !!header && (["business_drawing", "personal_drawing", "operation"].some(key => amount(header[key])) ||
    (Array.isArray(wages) && wages.some(row => amount(row?.amount))));
}
