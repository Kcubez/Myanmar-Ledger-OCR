"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Box, Fade, FormControl, LinearProgress, MenuItem, Select, TextField, Typography } from "@mui/material";

type Mode = "overall" | "day" | "month" | "year" | "custom";

const MODES: { value: Mode; label: string }[] = [
  { value: "overall", label: "All" },
  { value: "day", label: "Daily" },
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
  { value: "custom", label: "Custom range" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function isoDay(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const fieldSx = {
  minWidth: 96,
  "& .MuiOutlinedInput-root": {
    minHeight: 38,
    borderRadius: "8px",
    bgcolor: "#fff",
    color: "var(--ink)",
    fontSize: "0.85rem",
    fontWeight: 600,
    transition: "border-color .15s ease, box-shadow .15s ease",
    "& fieldset": { borderColor: "var(--line)" },
    "&:hover fieldset": { borderColor: "var(--leaf)" },
    "&.Mui-focused": { boxShadow: "0 0 0 3px rgba(121,85,199,.16)" },
    "&.Mui-focused fieldset": { borderColor: "var(--leaf)", borderWidth: 1 },
  },
  "& .MuiSelect-select, & input": { py: "8px", pr: "30px !important" },
};

const menuProps = {
  slotProps: { paper: { sx: { mt: 0.5, borderRadius: "10px", border: "1px solid var(--line)", boxShadow: "0 10px 28px rgba(35,27,50,.14)", "& .MuiMenuItem-root": { minHeight: 40, fontSize: "0.85rem", fontWeight: 600, "&.Mui-selected": { bgcolor: "var(--soft)", color: "var(--leaf)" } } } } },
};

/**
 * BAI-style date filter: compact pill pinned to the right side of a
 * PageHeader via the `actions` slot. URL params are the source of truth
 * (URL-only persistence, so shared links carry the filter).
 */
export function DateFilter() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const now = new Date();

  const rawMode = searchParams.get("period");
  const mode: Mode =
    rawMode === "overall" || rawMode === "day" || rawMode === "year" || rawMode === "custom" ? rawMode : "month";
  const year = Number(searchParams.get("year") || now.getFullYear());
  const month = Number(searchParams.get("month") || now.getMonth() + 1);
  const day = Number(searchParams.get("day") || now.getDate());
  const from = searchParams.get("from") || isoDay(year, month, 1);
  const to = searchParams.get("to") || isoDay(year, month, new Date(year, month, 0).getDate());

  const [years] = useState(() => {
    const cy = now.getFullYear();
    return [cy - 2, cy - 1, cy, cy + 1];
  });

  function go(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    params.delete("wagePage");
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) params.delete(key);
      else params.set(key, value);
    }
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  function setMode(next: Mode) {
    if (next === "overall") {
      go({ period: "overall", month: undefined, day: undefined, year: undefined, from: undefined, to: undefined });
    } else if (next === "custom") {
      go({ period: "custom", month: undefined, day: undefined, year: undefined, from, to });
    } else if (next === "year") {
      go({ period: "year", year: String(year), month: undefined, day: undefined, from: undefined, to: undefined });
    } else if (next === "day") {
      go({
        period: "day",
        year: String(year),
        month: String(month),
        day: String(Math.min(day, new Date(year, month, 0).getDate())),
        from: undefined,
        to: undefined,
      });
    } else {
      go({ period: "month", year: String(year), month: String(month), day: undefined, from: undefined, to: undefined });
    }
  }

  return (
    <Box
      component="fieldset"
      className="date-filter"
      disabled={isPending}
      aria-busy={isPending}
      role="group"
      aria-label="Date filter"
      sx={{
        m: 0,
        p: "4px 8px",
        minWidth: 0,
        display: "inline-flex",
        alignItems: "center",
        flexWrap: { xs: "wrap", sm: "nowrap" },
        bgcolor: isPending ? "rgba(242, 238, 249, 0.7)" : "#ffffff",
        border: "1px solid",
        borderColor: isPending ? "var(--leaf)" : "var(--line)",
        borderRadius: "12px",
        boxShadow: "0 1px 3px rgba(23, 36, 27, 0.04)",
        transition: "all 0.2s ease",
        position: "relative",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
        <FormControl size="small" sx={{ ...fieldSx, minWidth: 122 }}>
          <Select aria-label="Period" value={mode} onChange={(e) => setMode(e.target.value as Mode)} MenuProps={menuProps}>
            {MODES.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
          </Select>
        </FormControl>

        {mode === "day" && (
          <TextField
            type="date"
            aria-label="Day"
            size="small"
            value={isoDay(year, month, Math.min(day, new Date(year, month, 0).getDate()))}
            onChange={(e) => {
              const parts = e.target.value.split("-").map(Number);
              if (parts.length === 3 && parts.every((n) => Number.isInteger(n))) {
                go({ period: "day", year: String(parts[0]), month: String(parts[1]), day: String(parts[2]) });
              }
            }}
            sx={{ ...fieldSx, minWidth: 152 }}
          />
        )}

        {mode === "month" && (
          <FormControl size="small" sx={{ ...fieldSx, minWidth: 88 }}>
            <Select aria-label="Month" value={String(month)} onChange={(e) => go({ month: e.target.value, day: undefined })} MenuProps={menuProps}>
              {MONTHS.map((name, i) => <MenuItem key={name} value={String(i + 1)}>{name}</MenuItem>)}
            </Select>
          </FormControl>
        )}

        {mode !== "overall" && mode !== "custom" && mode !== "day" && (
          <FormControl size="small" sx={{ ...fieldSx, minWidth: 84 }}>
            <Select aria-label="Year" value={String(year)} onChange={(e) => go({ year: e.target.value })} MenuProps={menuProps}>
              {years.map((y) => <MenuItem key={y} value={String(y)}>{y}</MenuItem>)}
            </Select>
          </FormControl>
        )}

        {mode === "custom" && (
          <Box className="date-range-fields" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, width: { xs: "100%", sm: "auto" } }}>
            <TextField
              type="date"
              aria-label="From date"
              size="small"
              value={from}
              slotProps={{ htmlInput: { max: to } }}
              onChange={(e) => {
                if (e.target.value && e.target.value <= to) go({ from: e.target.value });
              }}
              sx={{ ...fieldSx, minWidth: { xs: 0, sm: 152 }, flex: { xs: 1, sm: "0 0 auto" } }}
            />
            <Typography variant="caption" sx={{ color: "var(--muted)", fontWeight: 500 }}>
              to
            </Typography>
            <TextField
              type="date"
              aria-label="To date"
              size="small"
              value={to}
              slotProps={{ htmlInput: { min: from } }}
              onChange={(e) => {
                if (e.target.value && e.target.value >= from) go({ to: e.target.value });
              }}
              sx={{ ...fieldSx, minWidth: { xs: 0, sm: 152 }, flex: { xs: 1, sm: "0 0 auto" } }}
            />
          </Box>
        )}
      </Box>

      <Fade in={isPending} unmountOnExit>
        <LinearProgress aria-label="Refreshing results" sx={{ position: "absolute", height: 2, bottom: -1, left: 8, right: 8, borderRadius: 1, bgcolor: "transparent", "& .MuiLinearProgress-bar": { bgcolor: "var(--leaf)" } }} />
      </Fade>
    </Box>
  );
}
