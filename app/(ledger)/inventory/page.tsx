import { PaginatedTable } from "../../../components/PaginatedTable";
import { DeleteRangeButton } from "../../../components/DeleteRangeButton";
import Link from "next/link";
import { ownerPageOrRedirect } from "../../../lib/owner-page";
import { prisma } from "../../../lib/prisma";
import { parseDateFilter, rangeWhere } from "../../../lib/date-filter";
import { INVENTORY_CATEGORIES, type InventoryCategory } from "../../../lib/inventory";
import { PageHeader } from "../../../components/layout";
import { DateFilter } from "../../../components/DateFilter";
import { InventoryFilter } from "../../../components/InventoryFilter";

export const dynamic = "force-dynamic";
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const quantity = (n: { toString(): string } | null) => n === null ? "—" : Number(n.toString()).toLocaleString("en-US", { maximumFractionDigits: 3 });

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await ownerPageOrRedirect();
  const params = await searchParams;
  const range = parseDateFilter(params);
  const category = typeof params.category === "string" && INVENTORY_CATEGORIES.includes(params.category as InventoryCategory) ? params.category : undefined;
  const page = Math.max(1, Math.min(10000, Math.floor(Number(params.page) || 1)));
  const entryWhere = category ? { category } : {};
  const found = await prisma.dailyReport.findMany({
    where: { status: "CONFIRMED", date: rangeWhere(range), inventoryEntries: { some: entryWhere } },
    orderBy: { date: "desc" }, skip: (page - 1) * 20, take: 21,
    include: { inventoryEntries: { where: entryWhere, orderBy: [{ sheetKind: "asc" }, { position: "asc" }] } },
  });
  const entryCount = await prisma.inventoryEntry.count({ where: { ...entryWhere, report: { status: "CONFIRMED", date: rangeWhere(range) } } });
  const reports = found.slice(0, 20);
  function pageUrl(nextPage: number) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (typeof value === "string") query.set(key, value);
    query.set("page", String(nextPage)); return `/inventory?${query}`;
  }
  return <>
    <PageHeader title="Inventory" sub={`${range.label} · Daily stock movements and balances`} actions={<><DateFilter /><InventoryFilter /><DeleteRangeButton kind="inventory" category={category} kindLabel={category ? `${category} inventory` : "inventory"} count={entryCount} scopeLabel={range.label} gte={range.gte?.toISOString() ?? null} lte={range.lte?.toISOString() ?? null} /></>} />
    <div className="inventory-units"><span>Sand / Gravel · sud</span><span>Cement · bags</span><span>Brick · Nos</span><span>Fuel · gal</span></div>
    {!reports.length && <section className="card pad"><h2>No approved inventory sheets</h2><p className="muted">Send a daily Inventory photo in Telegram, then review it in Approvals. Try another date or product filter to see earlier sheets.</p><Link href="/approvals">Open approvals</Link></section>}
    {reports.map(report => <div key={report.id} style={{ display: "grid", gap: 16, marginBottom: 24 }}>
      {(["materials", "fuel"] as const).map(sheet => {
        const rows = report.inventoryEntries.filter(row => row.sheetKind === sheet);
        if (!rows.length) return null;
        const totalIn = rows.reduce((sum, row) => sum + Number(row.quantityIn ?? 0), 0);
        const totalOut = rows.reduce((sum, row) => sum + Number(row.quantityOut ?? 0), 0);
        const format = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });
        return <section className="card pad" key={sheet}>
          <h2>{report.date.toISOString().slice(0, 10)} · {sheet === "fuel" ? "Fuel" : "Materials"}</h2>
          {sheet === "fuel" && <>
            <p><strong>Recorded in:</strong> {format(totalIn)} gal　 <strong>Recorded out:</strong> {format(totalOut)} gal　 <strong>Closing balance:</strong> {quantity(rows[rows.length - 1].balance)} gal</p>
            <p className="muted">Shared tank · Rows follow the source sheet. Closing balance is the final row, not a sum. Blank cells are shown as —; totals include recorded quantities only.</p>
          </>}
          <div className="table-wrap ledger-list"><PaginatedTable className="responsive-ledger" role="table">
            <thead><tr><th>Date</th><th>Category</th><th>Particular</th><th>In</th><th>Out</th><th>Balance</th><th>Unit</th></tr></thead>
            <tbody>{rows.map(row => <tr key={row.id}>
              <td data-label="Date">{report.date.toISOString().slice(0, 10)}</td>
              <td data-label="Category">{title(row.category)}</td>
              <td data-label="Particular">{row.particular || "—"}{row.balanceOk === false && <span title="Running balance does not match the previous row"> · ⚠ Balance mismatch</span>}</td>
              <td data-label="In">{quantity(row.quantityIn)}</td><td data-label="Out">{quantity(row.quantityOut)}</td><td data-label="Balance"><strong>{quantity(row.balance)}</strong></td><td data-label="Unit">{row.category === "brick" ? "Nos" : row.unit}</td>
            </tr>)}</tbody>
          </PaginatedTable></div>
        </section>;
      })}
    </div>)}
    {(page > 1 || found.length > 20) && <nav aria-label="Inventory pages" style={{ display: "flex", gap: 20, marginBottom: 24 }}>{page > 1 && <Link href={pageUrl(page - 1)}>← Newer dates</Link>}{found.length > 20 && <Link href={pageUrl(page + 1)}>Older dates →</Link>}</nav>}
  </>;
}
