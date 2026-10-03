/** Display helper: ISO `YYYY-MM-DD` → `DD-MM-YYYY`. Non-ISO passes through. */
export function formatDMY(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}
