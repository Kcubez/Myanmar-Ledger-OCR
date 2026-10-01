export const INVENTORY_CATEGORIES = ["sand", "gravel", "cement", "brick", "fuel"] as const;
export type InventoryCategory = typeof INVENTORY_CATEGORIES[number];
export const INVENTORY_UNITS: Record<InventoryCategory, string> = { sand: "sud", gravel: "sud", cement: "bags", brick: "Nos", fuel: "gal" };
