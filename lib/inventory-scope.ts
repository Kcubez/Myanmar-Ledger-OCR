import { INVENTORY_CATEGORIES, type InventoryCategory } from "./inventory";

/** One scope for the movement table, its count, and destructive actions. */
export function inventoryScope(category?: string, variant?: string) {
  if (category && !INVENTORY_CATEGORIES.includes(category as InventoryCategory)) throw new Error("Invalid product.");
  if (!variant) return category ? { category } : {};
  const value: unknown = JSON.parse(variant);
  if (!Array.isArray(value) || value.length !== 3 || value.some(v => typeof v !== "string")) throw new Error("Invalid variant.");
  const [product, particular, unit] = value as string[];
  if (!INVENTORY_CATEGORIES.includes(product as InventoryCategory) || (category && category !== product) || !unit || (product === "fuel" && particular !== "")) throw new Error("Invalid variant.");
  return { category: product, unit, ...(product === "fuel" ? {} : { particular }) };
}
