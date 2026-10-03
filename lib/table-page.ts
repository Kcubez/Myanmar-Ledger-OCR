export type TablePage = { page: number; total: number; query: string; pageParam?: string; queryParam?: string };
export function tableRequest(params: Record<string, string | string[] | undefined>, prefix = "") {
  const pageParam = prefix ? `${prefix}Page` : "page";
  const queryParam = prefix ? `${prefix}Query` : "query";
  const raw = Number(params[pageParam]);
  return { page: Number.isSafeInteger(raw) && raw > 0 ? Math.min(raw, 1000000) : 1,
    query: typeof params[queryParam] === "string" ? params[queryParam].trim().slice(0, 100) : "", pageParam, queryParam };
}
export function clampPage(page: number, total: number) { return Math.min(page, Math.max(1, Math.ceil(total / 10))); }
