"use client";

import { StatCard } from "./layout";
import { InventoryCharts } from "./charts";
import { stockSeries, type StockRow } from "../lib/inventory-analytics";
export function InventoryAnalytics({ rows, period }: { rows: StockRow[]; period: string }) {
  const groups = stockSeries(rows);
  const group = groups[0];
  if (!group) return null;
  const last = group.days.at(-1)!;
  const incoming = group.days.reduce((sum,d) => sum+d.incoming,0);
  const outgoing = group.days.reduce((sum,d) => sum+d.outgoing,0);
  const format = (n: number | null) => n === null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits:3 });
  return <section aria-label="Inventory analytics" style={{ marginBottom:24 }}>
    <div className="inventory-analytics-heading"><div><h2>Product summary</h2></div>
      <span className="muted">{group.label} · {group.unit}</span>
    </div>
    <section className="stats">
      <StatCard label="Closing balance" value={`${format(last.balance)} ${group.unit}`} sub={`As of ${last.date}`} />
      <StatCard label="Total in" value={`${format(incoming)} ${group.unit}`} sub={period} tone="good" />
      <StatCard label="Total out" value={`${format(outgoing)} ${group.unit}`} sub={period} />
      <StatCard label="Net movement" value={`${format(incoming-outgoing)} ${group.unit}`} sub="Total in − Total out" />
    </section>
    <InventoryCharts data={group.days} unit={group.unit} />
  </section>;
}
