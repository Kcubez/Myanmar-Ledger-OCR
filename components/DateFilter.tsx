"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

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

/**
 * BAI-style date filter: compact pill pinned to the right side of a
 * PageHeader via the `actions` slot. URL params are the source of truth
 * (URL-only persistence, so shared links carry the filter).
 */
export function DateFilter() {
  const router = useRouter();
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
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) params.delete(key);
      else params.set(key, value);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
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
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
        border: "1px solid var(--line)",
        borderRadius: 12,
        padding: 6,
      }}
      role="group"
      aria-label="Date filter"
    >
      <select aria-label="Period" value={mode} onChange={(e) => setMode(e.target.value as Mode)} style={inputStyle}>
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
          style={inputStyle}
        />
      )}

      {mode === "month" && (
        <select
          aria-label="Month"
          value={String(month)}
          onChange={(e) => go({ month: e.target.value, day: undefined })}
          style={inputStyle}
        >
          {MONTHS.map((name, i) => (
            <option key={name} value={String(i + 1)}>
              {name}
            </option>
          ))}
        </select>
      )}

      {mode !== "overall" && mode !== "custom" && (
        <select aria-label="Year" value={String(year)} onChange={(e) => go({ year: e.target.value })} style={inputStyle}>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
      )}

      {mode === "custom" && (
        <>
          <input
            type="date"
            aria-label="From date"
            value={from}
            max={to}
            onChange={(e) => {
              if (e.target.value && e.target.value <= to) go({ from: e.target.value });
            }}
            style={inputStyle}
          />
          <span className="muted">to</span>
          <input
            type="date"
            aria-label="To date"
            value={to}
            min={from}
            onChange={(e) => {
              if (e.target.value && e.target.value >= from) go({ to: e.target.value });
            }}
            style={inputStyle}
          />
        </>
      )}
    </div>
  );
}

const inputStyle = {
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid var(--line)",
  background: "transparent",
  fontSize: ".85rem",
  fontWeight: 600,
} as const;
