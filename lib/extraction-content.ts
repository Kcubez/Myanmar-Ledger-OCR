/** A date/summary alone is never a replacement ledger, including expense's object payload. */
export function hasLedgerContent(mode: string, lines: unknown): boolean {
  if (mode !== "expense") return Array.isArray(lines) && lines.length > 0;
  if (!lines || typeof lines !== "object" || Array.isArray(lines)) return false;
  const { header, wages } = lines as { header?: Record<string, unknown>; wages?: { amount?: unknown }[] };
  const amount = (value: unknown) => typeof value === "string" && /[0-9၀-၉]/.test(value);
  return !!header && (["business_drawing", "personal_drawing", "operation"].some(key => amount(header[key])) ||
    (Array.isArray(wages) && wages.some(row => amount(row?.amount))));
}
