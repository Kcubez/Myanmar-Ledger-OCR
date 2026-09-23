/**
 * Report-date resolution: the photo's CONTENT date wins (e.g. "21/9/2026"
 * written in the ledger header); the upload date is fallback only.
 * Running fuel/brick pages therefore merge into the right daily report.
 */

/** Extract a calendar date from free-form source text. Returns null if none. */
export function extractContentDate(text: string): Date | null {
  const cleaned = text.replace(/\(.*?\)/g, " ");
  const patterns = [
    /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/,
    /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/,
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (!match) continue;
    let year: number;
    let month: number;
    let day: number;
    if (match[1].length === 4) {
      year = Number(match[1]);
      month = Number(match[2]);
      day = Number(match[3]);
    } else {
      day = Number(match[1]);
      month = Number(match[2]);
      year = Number(match[3]);
      if (year < 100) year += 2000;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(date.getTime())) continue;
    return date;
  }
  return null;
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
