"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { CircularProgress } from "@mui/material";
import { useTransition } from "react";
import { INVENTORY_CATEGORIES } from "../lib/inventory";

export function InventoryFilter({ variants }: { variants: {id:string; label:string}[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <div className="inventory-product-filter" aria-busy={pending}>
    <select aria-label="Filter inventory by product" className="inventory-filter-select" value={params.get("category") ?? "all"} disabled={pending} onChange={event => {
      const next = new URLSearchParams(params.toString());
      next.set("category", event.target.value); next.delete("page"); next.delete("variant");
      startTransition(() => router.replace(`/inventory?${next}`, { scroll: false }));
    }}>
      <option value="all">All products</option>
      {INVENTORY_CATEGORIES.map(category => <option key={category} value={category}>{category[0].toUpperCase() + category.slice(1)}</option>)}
    </select>
    <select aria-label="Filter inventory by variant" className="inventory-filter-select" disabled={pending || !variants.length} value={params.get("variant") ?? ""} onChange={event => {
      const next = new URLSearchParams(params.toString()); next.delete("page");
      if (event.target.value) next.set("variant",event.target.value); else next.delete("variant");
      startTransition(() => router.replace(`/inventory?${next}`, {scroll:false}));
    }}><option value="">All variants</option>{variants.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select>
    {pending && <span className="inventory-filter-status" role="status"><CircularProgress size={12} color="inherit" /> Updating…</span>}
  </div>;
}
