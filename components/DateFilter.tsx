"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Box, CircularProgress, Fade, Typography } from "@mui/material";

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

const selectStyle = {
  appearance: "none" as const,
  WebkitAppearance: "none" as const,
  padding: "6px 26px 6px 10px",
  borderRadius: "8px",
  border: "1px solid var(--line)",
  backgroundColor: "#fff",
  color: "var(--ink)",
  fontSize: "0.85rem",
  fontWeight: 600,
  cursor: "pointer",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235f6f63' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 8px center",
  backgroundSize: "12px",
  outline: "none",
  transition: "border-color 0.15s ease, box-shadow 0.15s ease",
};

const dateInputStyle = {
  padding: "5px 9px",
  borderRadius: "8px",
  border: "1px solid var(--line)",
  backgroundColor: "#fff",
  color: "var(--ink)",
  fontSize: "0.85rem",
  fontWeight: 600,
  outline: "none",
  transition: "border-color 0.15s ease, box-shadow 0.15s ease",
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
      disabled={isPending}
      aria-busy={isPending}
      role="group"
      aria-label="Date filter"
      sx={{
        m: 0,
        p: "5px 8px",
        minWidth: 0,
        display: "inline-flex",
        alignItems: "center",
        gap: 1,
        flexWrap: "wrap",
        bgcolor: isPending ? "rgba(240, 246, 241, 0.7)" : "#ffffff",
        border: "1px solid",
        borderColor: isPending ? "var(--leaf)" : "var(--line)",
        borderRadius: "12px",
        boxShadow: "0 1px 3px rgba(23, 36, 27, 0.04)",
        transition: "all 0.2s ease",
        position: "relative",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
        <select
          aria-label="Period"
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
          style={selectStyle}
        >
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>

        {mode === "day" && (
          <input
            type="date"
            aria-label="Day"
            value={isoDay(year, month, Math.min(day, new Date(year, month, 0).getDate()))}
            onChange={(e) => {
              const parts = e.target.value.split("-").map(Number);
              if (parts.length === 3 && parts.every((n) => Number.isInteger(n))) {
                go({ period: "day", year: String(parts[0]), month: String(parts[1]), day: String(parts[2]) });
              }
            }}
            style={dateInputStyle}
          />
        )}

        {mode === "month" && (
          <select
            aria-label="Month"
            value={String(month)}
            onChange={(e) => go({ month: e.target.value, day: undefined })}
            style={selectStyle}
          >
            {MONTHS.map((name, i) => (
              <option key={name} value={String(i + 1)}>
                {name}
              </option>
            ))}
          </select>
        )}

        {mode !== "overall" && mode !== "custom" && (
          <select
            aria-label="Year"
            value={String(year)}
            onChange={(e) => go({ year: e.target.value })}
            style={selectStyle}
          >
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        )}

        {mode === "custom" && (
          <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
            <input
              type="date"
              aria-label="From date"
              value={from}
              max={to}
              onChange={(e) => {
                if (e.target.value && e.target.value <= to) go({ from: e.target.value });
              }}
              style={dateInputStyle}
            />
            <Typography variant="caption" sx={{ color: "var(--muted)", fontWeight: 500 }}>
              to
            </Typography>
            <input
              type="date"
              aria-label="To date"
              value={to}
              min={from}
              onChange={(e) => {
                if (e.target.value && e.target.value >= from) go({ to: e.target.value });
              }}
              style={dateInputStyle}
            />
          </Box>
        )}
      </Box>

      {/* Loading feedback */}
      <Fade in={isPending} unmountOnExit>
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.75,
            px: 0.75,
            py: 0.25,
            borderRadius: "6px",
            bgcolor: "var(--ok-bg)",
            color: "var(--ok)",
          }}
        >
          <CircularProgress size={12} color="inherit" thickness={5} />
          <Typography sx={{ fontSize: "0.74rem", fontWeight: 700, letterSpacing: "0.02em" }}>
            Updating…
          </Typography>
        </Box>
      </Fade>
    </Box>
  );
}

