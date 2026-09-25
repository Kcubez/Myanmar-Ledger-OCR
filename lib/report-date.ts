/**
 * Report-date resolution: the photo's CONTENT date wins (e.g. "21/9/2026"
 * written in the ledger header); the upload date is fallback only.
 * Running fuel/brick pages therefore merge into the right daily report.
 */
import { normalizeDigits } from "./extract/shared";

/** Extract a calendar date from free-form source text. Returns null if none. */
export function extractContentDate(text: string): Date | null {
  // Normalize Myanmar digits ၀-၉ first — handwritten headers often use them.
  const cleaned = normalizeDigits(text).replace(/\(.*?\)/g, " ");
  // Year-first BEFORE day-first: otherwise "2026-09-21" matches the d/m/Y
  // branch as 26-09-21 → 2021-09-26. Guards keep matches off digit runs.
  const ymd = cleaned.match(/(?:^|[^\d])(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?!\d)/);
  if (ymd) {
    const date = validDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
    if (date) return date;
  }
  const dmy = cleaned.match(/(?:^|[^\d])(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?!\d)/);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    const date = validDate(year, Number(dmy[2]), Number(dmy[1]));
    if (date) return date;
  }
  return null;
}

/** Build a UTC-midnight date only if the components round-trip (kills Feb 31). */
function validDate(year: number, month: number, day: number): Date | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

/** Start-of-day UTC for a content-date string, or the fallback day. */
export function resolveReportDate(contentDateText: string, fallback: Date = new Date()): Date {
  const extracted = contentDateText ? extractContentDate(contentDateText) : null;
  const base = extracted ?? fallback;
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
}

/** yyyy-mm-dd key for storage paths and display. */
export function dateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
