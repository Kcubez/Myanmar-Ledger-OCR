import { Prisma } from "../generated/prisma/client";
import { prisma } from "./prisma";
import type { DateRange } from "./date-filter";
import { clampPage, type TablePage } from "./table-page";
import { inventoryScope } from "./inventory-scope";
import type { StockRow } from "./inventory-analytics";

function dates(range: DateRange) {
  return Prisma.sql`r.status = 'CONFIRMED' ${range.gte ? Prisma.sql`AND r.date >= ${range.gte}` : Prisma.empty} ${range.lte ? Prisma.sql`AND r.date < ${range.lte}` : Prisma.empty}`;
}
const pattern = (query: string) => `%${query.replace(/[\\%_]/g, "\\$&")}%`;
function scopeSql(category?: string, variant?: string) {
  const scope = inventoryScope(category, variant);
  return Prisma.sql`${scope.category ? Prisma.sql`AND e.category = ${scope.category}` : Prisma.empty}
    ${"unit" in scope ? Prisma.sql`AND e.unit = ${scope.unit}` : Prisma.empty}
    ${"particular" in scope ? Prisma.sql`AND trim(e.particular) = ${scope.particular}` : Prisma.empty}`;
}

/** Search and pagination happen in PostgreSQL, never on a downloaded full ledger. */
export async function entryPage(kind: "inventory" | "maintenance" | "wage", range: DateRange, request: Omit<TablePage, "total">, category?: string, variant?: string) {
  const table = kind === "inventory" ? Prisma.sql`inventory_entry` : kind === "wage" ? Prisma.sql`expense_line` : Prisma.sql`maintenance_line`;
  const fields = kind === "inventory" ? Prisma.sql`e.category, e.particular, e.remark, e.unit, e.quantity_in, e.quantity_out, e.balance`
    : kind === "wage" ? Prisma.sql`e.name, e.amount` : Prisma.sql`e.vehicle, e.part, e.amount`;
  const filters = Prisma.sql`${dates(range)} ${kind === "inventory" ? scopeSql(category, variant) : kind === "wage" ? Prisma.sql`AND e.category = 'WAGES'` : Prisma.empty}
    ${request.query ? Prisma.sql`AND concat_ws(' ', to_char(r.date, 'YYYY-MM-DD'), to_char(r.date, 'DD-MM-YYYY'), ${fields}) ILIKE ${pattern(request.query)}` : Prisma.empty}`;
    const [count] = await prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT count(*) AS total FROM ${table} e JOIN daily_report r ON r.id = e.report_id WHERE ${filters}`);
    const total = Number(count.total), page = clampPage(request.page, total);
    const ids = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT e.id FROM ${table} e JOIN daily_report r ON r.id = e.report_id WHERE ${filters}
      ORDER BY r.date DESC, ${kind === "inventory" ? Prisma.sql`e.position ASC,` : Prisma.empty} e.id ASC LIMIT 10 OFFSET ${(page - 1) * 10}`);
    return { ...request, total, page, ids: ids.map(row => row.id) };
}

export type DailyPageRow = { date: Date; total: bigint; values: Record<string, number>; count: number; wages: number };
export async function dailyPage(kind: "revenue" | "expense", range: DateRange, request: Omit<TablePage, "total">) {
  const table = kind === "revenue" ? Prisma.sql`revenue_line` : Prisma.sql`expense_line`;
  const field = kind === "revenue" ? Prisma.sql`e.method` : Prisma.sql`e.category`;
  const grouped = Prisma.sql`WITH categories AS (
    SELECT r.date, ${field}::text AS label, sum(e.amount) AS amount, count(*)::int AS count
    FROM ${table} e JOIN daily_report r ON r.id = e.report_id WHERE ${dates(range)} GROUP BY r.date, ${field}
  ), days AS (
    SELECT date, sum(amount)::bigint AS total, jsonb_object_agg(label, amount) AS values,
      sum(count)::int AS count, coalesce(sum(count) FILTER (WHERE label = 'WAGES'), 0)::int AS wages
    FROM categories GROUP BY date
  )`;
  const filter = request.query ? Prisma.sql`WHERE concat_ws(' ', to_char(date, 'YYYY-MM-DD'), to_char(date, 'DD-MM-YYYY'), total, values::text) ILIKE ${pattern(request.query)}` : Prisma.empty;
    const [count] = await prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`${grouped} SELECT count(*) AS total FROM days ${filter}`);
    const total = Number(count.total), page = clampPage(request.page, total);
    const rows = await prisma.$queryRaw<DailyPageRow[]>(Prisma.sql`${grouped} SELECT * FROM days ${filter} ORDER BY date DESC LIMIT 10 OFFSET ${(page - 1) * 10}`);
    return { ...request, total, page, rows };
}

/** One row per product/day; the final physical balance (even null) is retained. */
export async function inventoryDays(range: DateRange, category?: string, variant?: string): Promise<StockRow[]> {
  const rows = await prisma.$queryRaw<(Omit<StockRow, "date"> & { date: Date })[]>(Prisma.sql`
    WITH movements AS (
      SELECT r.date, e.category, CASE WHEN e.category = 'fuel' THEN '' ELSE trim(e.particular) END AS particular, e.unit,
        sum(e.quantity_in) OVER w AS incoming, sum(e.quantity_out) OVER w AS outgoing,
        e.balance, e.position, row_number() OVER (PARTITION BY r.date, e.category,
          CASE WHEN e.category = 'fuel' THEN '' ELSE trim(e.particular) END, e.unit ORDER BY e.position DESC, e.id DESC) AS last
      FROM inventory_entry e JOIN daily_report r ON r.id = e.report_id WHERE ${dates(range)} ${scopeSql(category, variant)}
      WINDOW w AS (PARTITION BY r.date, e.category, CASE WHEN e.category = 'fuel' THEN '' ELSE trim(e.particular) END, e.unit)
    ) SELECT date, category, particular, unit, incoming, outgoing, balance, position FROM movements WHERE last = 1 ORDER BY date ASC`);
  return rows.map(row => ({ ...row, date: row.date.toISOString().slice(0, 10), incoming: row.incoming === null ? null : Number(row.incoming), outgoing: row.outgoing === null ? null : Number(row.outgoing), balance: row.balance === null ? null : Number(row.balance) }));
}
