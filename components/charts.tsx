"use client";

import { useState } from "react";
import { useMediaQuery } from "@mui/material";
import { weeklyStock } from "../lib/chart-periods";
import { BarChart as MuiBarChart, LineChart, PieChart } from "@mui/x-charts";

// Keep exact, full-comma amounts everywhere, including axes and tooltips.
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const LEAF = "#8b63cf";
const RED = "#a63434";
const COLORS = [LEAF, "#b196dd", "#cec0e7", "#bc914a", "#778ab5"];
const chartStyle = {
  "& .MuiChartsGrid-line": { stroke: "#eeebf3", strokeDasharray: "3 5" },
  "& .MuiChartsAxis-tickLabel": { fill: "#605c70", fontSize: 11 },
  "& .MuiLineElement-root": { strokeWidth: 2.5 },
};

function GroupingControl({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="segmented-toggle" role="group" aria-label={label}>
      {(["daily", "weekly"] as const).map((opt) => (
        <button key={opt} type="button" aria-pressed={value === opt} className={value === opt ? "is-active" : ""} onClick={() => onChange(opt)}>
          {opt === "daily" ? "Daily" : "Weekly"}
        </button>
      ))}
    </div>
  );
}

export function TrendChart({ data: source }: { data: { label: string; a: number; b: number }[] }) {
  const mobile = useMediaQuery("(max-width:760px)");
  const [grouping, setGrouping] = useState("weekly");
  const canGroup = source.length > 14;
  const aggregated = grouping === "weekly" && canGroup && source.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d.label));
  const data = aggregated ? weeklyStock(source.map(d => ({date:d.label,incoming:d.a,outgoing:d.b,balance:null}))).map(d => ({label:d.date,a:d.incoming,b:d.outgoing})) : source;
  const series = [
    { id: "revenue", dataKey: "a", label: "Revenue", color: "#218153", valueFormatter: (v: number | null) => v === null ? "—" : `${fmt(v)} Ks` },
    { id: "expense", dataKey: "b", label: "Expense", color: RED, valueFormatter: (v: number | null) => v === null ? "—" : `${fmt(v)} Ks` },
  ];
  const yAxis = [{ width: mobile ? 65 : 110, tickLabelStyle: { transform: "translateX(-8px)" }, min: 0, tickNumber: 4, disableLine: true, disableTicks: true, valueFormatter: (v: number) => mobile ? new Intl.NumberFormat("en",{notation:"compact"}).format(v) : fmt(v) }];
  const totalA = data.reduce((s, d) => s + d.a, 0);
  const totalB = data.reduce((s, d) => s + d.b, 0);
  return (
    <div className="ledger-trend" role="img" aria-label={`Revenue vs expense trend, ${data.length} ${aggregated ? "weekly" : "daily"} periods, revenue ${fmt(totalA)} Ks, expense ${fmt(totalB)} Ks`}>
      <div className="chart-card-header">
        <p className="chart-meta"><span>Amount · Ks</span></p>
        {canGroup && <GroupingControl value={grouping} onChange={setGrouping} label="Revenue chart grouping" />}
      </div>
      {data.length === 1 ? (
        <MuiBarChart height={270} dataset={data} series={series} borderRadius={5} hideLegend
          xAxis={[{ scaleType: "band", dataKey: "label", categoryGapRatio: 0.65, barGapRatio: 0.25, disableLine: true, disableTicks: true }]}
          yAxis={yAxis} grid={{ horizontal: true }} margin={{ top: 16, right: 16, bottom: 8 }}
          slotProps={{ tooltip: { trigger: "item" } }} sx={chartStyle} />
      ) : (
        <LineChart height={270} dataset={data} hideLegend
          xAxis={[{ scaleType: "point", dataKey: "label", valueFormatter: (v: string) => /^\d{4}-/.test(v) ? v.slice(5) : v, disableLine: true, disableTicks: true, tickLabelInterval: (_v, i) => i % Math.max(1, Math.ceil(data.length / (mobile ? 3 : 7))) === 0 }]}
          yAxis={yAxis}
          series={series.map((s) => ({ ...s, area: false, curve: "linear" as const, showMark: data.length <= 14 }))}
          grid={{ horizontal: true }} margin={{ top: 16, right: 24, bottom: 8 }}
          sx={chartStyle}>
        </LineChart>
      )}
      <div className="chart-legend"><span><i style={{ background: "#218153" }} />Revenue</span><span><i style={{ background: RED }} />Expense</span></div>
      {data.length === 1 && <p className="chart-note">One reporting day in this period. A trend appears as more days are recorded.</p>}
    </div>
  );
}

export function DonutChart({ slices, totalLabel = "Total revenue", centerLabel = "payment methods", unit = "Ks" }: { slices: { label: string; value: number }[]; totalLabel?: string; centerLabel?: string; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const active = hover === null ? null : slices[hover];
  const percent = (value: number) => total > 0 ? `${(value / total * 100).toFixed(1)}%` : "0%";
  const top = slices.length ? slices.reduce((a, b) => (b.value > a.value ? b : a)) : null;
  return (
    <div className="payment-chart" role="img" aria-label={`${totalLabel}, total ${fmt(total)} ${unit}${top ? `, largest: ${top.label} ${percent(top.value)}` : ""}`}>
      <div className="payment-ring">
        {total > 0 ? <PieChart width={196} height={196} hideLegend colors={COLORS}
          series={[{ id: "payment", data: slices.map((s, i) => ({ ...s, id: i })), innerRadius: 72, outerRadius: 94, paddingAngle: 3, cornerRadius: 4,
            highlightScope: { highlight: "item", fade: "global" }, valueFormatter: (s) => `${fmt(s.value)} ${unit} · ${percent(s.value)}` }]}
          highlightedItem={hover === null ? null : { seriesId: "payment", dataIndex: hover }}
          onHighlightChange={(h) => setHover(h?.dataIndex ?? null)} margin={0} /> : <div className="payment-ring-empty" />}
        <div className="payment-center"><span>{active ? percent(active.value) : slices.filter(s => s.value > 0).length}</span><small>{active ? active.label : centerLabel}</small></div>
      </div>
      <div className="payment-detail">
        <div className="payment-total"><span>{totalLabel}</span><strong>{fmt(total)} <small>{unit}</small></strong></div>
        <div className="payment-rows">{slices.map((s, i) => (
          <div key={s.label} className="payment-row" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span className="payment-label"><i style={{ background: COLORS[i % COLORS.length] }} />{s.label}</span>
            <strong>{fmt(s.value)}</strong><span className="payment-percent">{percent(s.value)}</span>
          </div>
        ))}</div>
      </div>
    </div>
  );
}

export function BarChart({ data, color = LEAF }: { data: { label: string; value: number }[]; color?: string }) {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const max = Math.max(...data.map(d => d.value), 0);
  const min = Math.min(...data.map(d => d.value), 0);
  if (!data.length) return <p className="chart-empty">No data for this period.</p>;
  return (
    <div className="ranked-chart" role="img" aria-label={`Ranked categories, top: ${sorted[0].label.replace(/_/g, " ")} ${fmt(sorted[0].value)}, ${sorted.length} categories`}>
      {sorted.map((d, i) => (
        <div className="ranked-row" key={`${d.label}-${i}`}>
          <div className="ranked-label"><span>{d.label.replace(/_/g, " ")}</span><strong>{fmt(d.value)}</strong></div>
          <MuiBarChart layout="horizontal" height={20} hideLegend borderRadius={4}
            series={[{ data: [d.value], color, valueFormatter: (v) => v === null ? "—" : fmt(v) }]}
            xAxis={[{ min, max: max || 1, position: "none" }]}
            yAxis={[{ scaleType: "band", data: [d.label], position: "none", categoryGapRatio: 0.15 }]}
            margin={0} slotProps={{ tooltip: { trigger: "item" } }}
            sx={{ backgroundColor: "#f2f5f2", borderRadius: "5px", "& .MuiBarElement-root": { fillOpacity: i === 0 ? 1 : 0.65 } }} />
        </div>
      ))}
    </div>
  );
}

type InventoryChartProps = { data: { date: string; incoming: number; outgoing: number; balance: number | null }[]; unit: string };
export function InventoryCharts(props: InventoryChartProps) {
  return <div className="inventory-charts"><InventoryChartCard {...props} kind="movement" /><InventoryChartCard {...props} kind="balance" /></div>;
}
function InventoryChartCard({ data: source, unit, kind }: InventoryChartProps & {kind:"movement"|"balance"}) {
  const mobile = useMediaQuery("(max-width:760px)");
  const [grouping,setGrouping] = useState(source.length > 14 ? "weekly" : "daily");
  const data = grouping === "weekly" ? weeklyStock(source) : source;
  const format = (n: number | null) => n === null ? "—" : `${n.toLocaleString("en-US", { maximumFractionDigits: 3 })} ${unit}`;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const shortDate = (iso: string) => {
    const parts = iso.split("-");
    if (parts.length !== 3) return iso;
    const m = Number(parts[1]);
    const d = Number(parts[2]);
    if (!m || !d) return iso;
    return `${MONTHS[m - 1]} ${d}`;
  };
  const plotData = data.map((d) => ({ ...d, label: shortDate(d.date) }));
  const thinTicks = (v: string, i: number) => i % Math.max(1, Math.ceil(plotData.length / (mobile ? 3 : 6))) === 0;
  if (!plotData.length) return <div className="inventory-charts"><section className="card pad"><p className="chart-empty">No data for this period.</p></section></div>;
  const canGroup = source.length > 14;
  const showGrouping = canGroup;
  const summary = kind === "movement"
    ? `Inventory movement, ${plotData.length} ${grouping} periods, in ${format(plotData.reduce((s, d) => s + d.incoming, 0))}, out ${format(plotData.reduce((s, d) => s + d.outgoing, 0))}`
    : `Closing balance trend, ${plotData.length} ${grouping} periods in ${unit}`;
  return <section className="card pad" role="img" aria-label={summary}>
    <div className="chart-card-header">
      <div><h2 className="chart-card-title">{kind === "movement" ? "In vs Out" : "Closing balance trend"}</h2><p className="chart-meta"><span>{unit}</span></p></div>
      {showGrouping && <GroupingControl value={grouping} onChange={setGrouping} label={`${kind === "movement" ? "In vs Out" : "Closing balance"} chart grouping`} />}
    </div>
    {kind === "movement" ? (
      <MuiBarChart dataset={plotData} height={280}
        xAxis={[{ scaleType: "band", dataKey: "label", categoryGapRatio: 0.65, barGapRatio: 0.25, disableLine: true, disableTicks: true, tickLabelInterval: thinTicks }]}
        yAxis={[{ width: mobile ? 55 : 80 }]} series={[
          { dataKey: "incoming", label: "In", color: "#218153", valueFormatter: format },
          { dataKey: "outgoing", label: "Out", color: "#bc914a", valueFormatter: format },
        ]} borderRadius={4} grid={{ horizontal: true }} margin={{ top: 16, right: 16, bottom: 32 }} sx={chartStyle} />
    ) : plotData.length === 1 ? (
        <MuiBarChart dataset={plotData} height={280}
          xAxis={[{ scaleType: "band", dataKey: "label", categoryGapRatio: 0.65, barGapRatio: 0.25, disableLine: true, disableTicks: true }]}
          yAxis={[{ width: mobile ? 55 : 80 }]} series={[{ dataKey: "balance", label: "Closing balance", color: LEAF, valueFormatter: format }]}
          borderRadius={4} grid={{ horizontal: true }} margin={{ top: 16, right: 16, bottom: 32 }} sx={chartStyle} />
      ) : (
        <LineChart dataset={plotData} height={280}
          xAxis={[{ scaleType: "point", dataKey: "label", disableLine: true, disableTicks: true, tickLabelInterval: thinTicks }]}
          yAxis={[{ width: mobile ? 55 : 80 }]} series={[{ dataKey: "balance", label: "Closing balance", color: LEAF, valueFormatter: format, curve: "linear", connectNulls: false, showMark: plotData.length <= 14 }]}
          grid={{ horizontal: true }} margin={{ top: 16, right: 24, bottom: 32 }} sx={chartStyle} />
      )}
  </section>;
}
