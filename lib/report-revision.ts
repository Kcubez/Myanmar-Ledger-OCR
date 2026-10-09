import { createHash } from "node:crypto";

export const editableRelations = {
  revenueLines: true, expenseLines: true, maintenanceLines: true,
  fuelEntries: true, brickEntries: true,
} as const;

/** Includes row identities and values so any concurrent edit or deletion invalidates a draft. */
export function reportRevision(report: Record<string, unknown>): string {
  const snapshot = Object.keys(editableRelations).map(key => [key,
    [...(report[key] as { id: string }[])].sort((a, b) => a.id.localeCompare(b.id)),
  ]);
  return createHash("sha256").update(JSON.stringify([report.status, report.date, snapshot],
    (_key, value) => typeof value === "bigint" ? value.toString() : value)).digest("hex");
}
