import { InventoryAnalytics } from "../../../components/InventoryAnalytics";
import { LedgerRowActions } from "../../../components/LedgerRowActions";
import { PaginatedTable } from "../../../components/PaginatedTable";
import { DeleteRangeButton } from "../../../components/DeleteRangeButton";
import { retryRead } from "../../../lib/read-retry";
import { stockSeries } from "../../../lib/inventory-analytics";
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
  const entryWhere = category ? { category } : {};
  const analyticsRows = await retryRead(() => prisma.inventoryEntry.findMany({ where: { ...entryWhere, report: { status: "CONFIRMED", date: rangeWhere(range) } }, include: { report: { select: { date: true } } }, orderBy: [{ report: { date: "asc" } }, { position: "asc" }] }));
  const stockRows = analyticsRows.map(row => ({ date: row.report.date.toISOString().slice(0,10), category: row.category, particular: row.particular, unit: row.unit, position: row.position, incoming: row.quantityIn === null ? null : Number(row.quantityIn), outgoing: row.quantityOut === null ? null : Number(row.quantityOut), balance: row.balance === null ? null : Number(row.balance) }));
  const groups = stockSeries(stockRows);
  const variant = typeof params.variant === "string" && groups.some(g => g.id === params.variant) ? params.variant : undefined;
  const selected = variant ?? (groups.length === 1 ? groups[0].id : undefined);
  const matches = (row: {category: string; particular: string; unit: string}) => !selected || JSON.stringify([row.category, row.category === "fuel" ? "" : row.particular.trim(), row.unit]) === selected;
  const rows = analyticsRows.filter(matches).sort((a,b) => b.report.date.getTime()-a.report.date.getTime() || a.position-b.position);
  const entryCount = analyticsRows.length;
  return <>
    <PageHeader title="Inventory" sub={range.label} actions={<><DateFilter /><InventoryFilter variants={groups.map(g => ({ id:g.id, label:g.label }))} /><DeleteRangeButton kind="inventory" category={category} kindLabel={category ? `${category} inventory` : "inventory"} count={entryCount} scopeLabel={`${range.label} · all variants in ${category || "all products"}`} gte={range.gte?.toISOString() ?? null} lte={range.lte?.toISOString() ?? null} /></>} />
    {selected ? <InventoryAnalytics period={range.label} rows={stockRows.filter(matches)} /> : <section className="card pad"><h2>Product summary</h2><p className="muted">Choose a variant above to see its balance and movements. Quantities with different units stay separate.</p></section>}
    <section className="card pad" style={{marginTop:24}}>
    <div className="table-wrap ledger-list"><PaginatedTable searchable title="Inventory movements" searchPlaceholder="Search date, product, or remark…">
            <thead><tr><th>Date</th><th>Category</th><th>Particular</th><th className="num">In</th><th className="num">Out</th><th className="num">Balance</th><th>Unit</th><th>Remark</th><th>Actions</th></tr></thead>
            <tbody>{rows.map(row => <tr key={row.id}>
              <td data-label="Date">{row.report.date.toISOString().slice(0, 10)}</td>
              <td data-label="Category">{title(row.category)}</td>
              <td data-label="Particular">{row.particular || "—"}{row.balanceOk === false && <span title="Running balance does not match the previous row"> · ⚠ Balance mismatch</span>}</td>
              <td data-label="In" className="num">{quantity(row.quantityIn)}</td><td data-label="Out" className="num">{quantity(row.quantityOut)}</td><td data-label="Balance" className="num"><strong>{quantity(row.balance)}</strong></td><td data-label="Unit">{row.category === "brick" ? "Nos" : row.unit}</td>
              <td data-label="Remark" className="inventory-remark">{row.remark || "—"}</td>
              <td data-label="Actions"><LedgerRowActions id={row.id} kind="inventory" values={{ particular: row.particular, remark: row.remark || "", quantityIn: row.quantityIn === null ? null : Number(row.quantityIn), quantityOut: row.quantityOut === null ? null : Number(row.quantityOut), balance: row.balance === null ? null : Number(row.balance) }} /></td>
            </tr>)}</tbody>
          </PaginatedTable></div>
    </section>
  </>;
}
