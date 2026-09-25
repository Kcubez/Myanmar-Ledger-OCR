/**
 * Date filter for ledger pages (BAI `use-date-filter` semantics, server-safe).
 * URL search params are the source of truth — no sessionStorage (URL-only,
 * so shared links carry the filter). Invalid input falls back to the
 * current month.
 *
 * Modes: overall | day | month | year | custom
 *   ?period=month&month=9&year=2026
 *   ?period=day&day=21&month=9&year=2026
 *   ?period=custom&from=2026-09-01&to=2026-09-21
 */

export type FilterMode = "overall" | "day" | "month" | "year" | "custom";

export type DateRange = {
  mode: FilterMode;
  /** Inclusive UTC start, or null for overall. */
  gte: Date | null;
  /** Exclusive UTC end, or null for overall. */
  lte: Date | null;
  /** Short human label for subtitles, e.g. "Sep 2026", "21/9/2026". */
  label: string;
};

type RawParams = Record<string, string | string[] | undefined>;

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const num = Number(raw);
  if (!Number.isInteger(num) || num < min || num > max) return fallback;
  return num;
}

function isIsoDate(raw: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime());
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function parseDateFilter(params: RawParams, now: Date = new Date()): DateRange {
  const rawMode = first(params.period);
  const mode: FilterMode =
    rawMode === "overall" || rawMode === "day" || rawMode === "year" || rawMode === "custom" ? rawMode : "month";

  const year = clampInt(first(params.year), 2000, 2100, now.getUTCFullYear());
  const month = clampInt(first(params.month), 1, 12, now.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = clampInt(first(params.day), 1, lastDay, Math.min(now.getUTCDate(), lastDay));

  if (mode === "overall") {
    return { mode, gte: null, lte: null, label: "All time" };
  }

  if (mode === "day") {
    const gte = new Date(Date.UTC(year, month - 1, day));
    return {
      mode,
      gte,
      lte: new Date(Date.UTC(year, month - 1, day + 1)),
      label: `${day}/${month}/${year}`,
    };
  }

  if (mode === "year") {
    return {
      mode,
      gte: new Date(Date.UTC(year, 0, 1)),
      lte: new Date(Date.UTC(year + 1, 0, 1)),
      label: `${year}`,
    };
  }

  if (mode === "custom") {
    const from = first(params.from);
    const to = first(params.to);
    if (isIsoDate(from) && isIsoDate(to) && from <= to) {
      const gte = new Date(`${from}T00:00:00.000Z`);
      const end = new Date(`${to}T00:00:00.000Z`);
      return {
        mode,
        gte,
        lte: new Date(end.getTime() + 24 * 60 * 60 * 1000),
        label: `${from} → ${to}`,
      };
    }
    // Invalid custom range → fall through to current month.
  }

  const mm = month;
  return {
    mode: "month",
    gte: new Date(Date.UTC(year, mm - 1, 1)),
    lte: new Date(Date.UTC(year, mm, 1)),
    label: `${MONTH_NAMES[mm - 1]} ${year}`,
  };
}

/** Prisma `date` where-clause for a range (overall → no constraint). */
export function rangeWhere(range: DateRange): { gte?: Date; lt?: Date } {
  if (!range.gte || !range.lte) return {};
  return { gte: range.gte, lt: range.lte };
}

/** Today at UTC midnight — handy default for components. */
export function todayUtc(): Date {
  return startOfUtcDay(new Date());
}
