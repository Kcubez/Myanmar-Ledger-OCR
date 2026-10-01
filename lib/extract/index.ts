export const LEDGER_TYPES = ["inventory", "revenue", "expense", "maintenance"] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number] | "fuel" | "brick";

export function isLedgerType(value: string | null | undefined): value is LedgerType {
  return [...LEDGER_TYPES, "fuel", "brick"].includes(value ?? "");
}

export * from "./shared";
export * from "./legacy";
export * from "./revenue";
export * from "./expense";
export * from "./maintenance";
export * from "./fuel";
export * from "./brick";

export * from "./inventory";
