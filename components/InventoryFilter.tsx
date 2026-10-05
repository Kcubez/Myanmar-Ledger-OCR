"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Box, FormControl, LinearProgress, MenuItem, Select } from "@mui/material";
import { useTransition } from "react";
import { INVENTORY_CATEGORIES } from "../lib/inventory";

export function InventoryFilter({ variants }: { variants: {id:string; label:string}[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const requestedVariant = params.get("variant") ?? "";
  const selectedVariant = variants.some(variant => variant.id === requestedVariant) ? requestedVariant : "";
  const controlSx = {
    flex: "1 1 138px", minWidth: 0,
    "& .MuiOutlinedInput-root": { minHeight: 38, borderRadius: "8px", bgcolor: "#fff", fontSize: "0.85rem", fontWeight: 600, "& fieldset": { borderColor: "var(--line)" }, "&:hover fieldset": { borderColor: "var(--leaf)" }, "&.Mui-focused": { boxShadow: "0 0 0 3px rgba(121,85,199,.16)" }, "&.Mui-focused fieldset": { borderColor: "var(--leaf)", borderWidth: 1 } },
    "& .MuiSelect-select": { py: "8px", pr: "30px !important", overflow: "hidden", textOverflow: "ellipsis" },
  };
  const menuProps = { slotProps: { paper: { sx: { mt: 0.5, borderRadius: "10px", border: "1px solid var(--line)", boxShadow: "0 10px 28px rgba(35,27,50,.14)", "& .MuiMenuItem-root": { minHeight: 40, fontSize: "0.85rem", fontWeight: 600, "&.Mui-selected": { bgcolor: "var(--soft)", color: "var(--leaf)" } } } } } };
  return <Box className="inventory-product-filter" aria-busy={pending}>
    <FormControl size="small" sx={controlSx}>
      <Select aria-label="Filter inventory by product" value={params.get("category") ?? "all"} disabled={pending} MenuProps={menuProps} onChange={event => {
      const next = new URLSearchParams(params.toString());
      next.set("category", event.target.value); next.delete("page"); next.delete("variant");
      startTransition(() => router.replace(`/inventory?${next}`, { scroll: false }));
    }}>
      <MenuItem value="all">All products</MenuItem>
      {INVENTORY_CATEGORIES.map(category => <MenuItem key={category} value={category}>{category[0].toUpperCase() + category.slice(1)}</MenuItem>)}
      </Select>
    </FormControl>
    <FormControl size="small" sx={controlSx}>
      <Select aria-label="Filter inventory by variant" disabled={pending || !variants.length} value={selectedVariant} displayEmpty renderValue={value => value ? variants.find(variant => variant.id === value)?.label ?? String(value) : "All variants"} MenuProps={menuProps} onChange={event => {
      const next = new URLSearchParams(params.toString()); next.delete("page");
      if (event.target.value) next.set("variant",event.target.value); else next.delete("variant");
      startTransition(() => router.replace(`/inventory?${next}`, {scroll:false}));
      }}><MenuItem value="">All variants</MenuItem>{variants.map(v => <MenuItem key={v.id} value={v.id}>{v.label}</MenuItem>)}</Select>
    </FormControl>
    {pending && <LinearProgress aria-label="Refreshing inventory results" sx={{ position: "absolute", height: 2, bottom: -1, left: 8, right: 8, borderRadius: 1, bgcolor: "transparent", "& .MuiLinearProgress-bar": { bgcolor: "var(--leaf)" } }} />}
  </Box>;
}
