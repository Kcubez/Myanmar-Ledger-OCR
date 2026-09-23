export const LEDGER_TYPES = ["revenue", "expense", "maintenance", "fuel", "brick"] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];

export function isLedgerType(value: string | null | undefined): value is LedgerType {
  return (LEDGER_TYPES as readonly string[]).includes(value ?? "");
}

export * from "./shared";
export * from "./legacy";
export * from "./revenue";
export * from "./expense";
export * from "./maintenance";
export * from "./fuel";
export * from "./brick";
