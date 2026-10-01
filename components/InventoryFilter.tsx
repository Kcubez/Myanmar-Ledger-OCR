"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { INVENTORY_CATEGORIES } from "../lib/inventory";

export function InventoryFilter() {
  const params = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <label className="muted">Product
    <select aria-label="Filter inventory by product" value={params.get("category") ?? "all"} disabled={pending} onChange={event => {
      const next = new URLSearchParams(params.toString());
      next.set("category", event.target.value); next.delete("page");
      startTransition(() => router.replace(`/inventory?${next}`, { scroll: false }));
    }}>
      <option value="all">All products</option>
      {INVENTORY_CATEGORIES.map(category => <option key={category} value={category}>{category[0].toUpperCase() + category.slice(1)}</option>)}
    </select>
  </label>;
}
