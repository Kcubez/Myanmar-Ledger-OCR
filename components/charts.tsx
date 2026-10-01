"use client";

import { useId, useState } from "react";
import { BarChart as MuiBarChart, LineChart, PieChart } from "@mui/x-charts";

// Keep exact, full-comma amounts everywhere, including axes and tooltips.
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const LEAF = "#8b63cf";
const RED = "#a63434";
const COLORS = [LEAF, "#b196dd", "#cec0e7", "#bc914a", "#778ab5"];
const chartStyle = {
  "& .MuiChartsGrid-line": { stroke: "#eeebf3", strokeDasharray: "3 5" },
  "& .MuiChartsAxis-tickLabel": { fill: "#777383", fontSize: 11 },
  "& .MuiLineElement-root": { strokeWidth: 2.5 },
};

export function TrendChart({ data }: { data: { label: string; a: number; b: number }[] }) {
  const id = useId().replace(/:/g, "");
  const series = [
    { id: "revenue", dataKey: "a", label: "Revenue", color: LEAF, valueFormatter: (v: number | null) => v === null ? "—" : `${fmt(v)} Ks` },
    { id: "expense", dataKey: "b", label: "Expense", color: RED, valueFormatter: (v: number | null) => v === null ? "—" : `${fmt(v)} Ks` },
  ];
  const yAxis = [{ width: 96, min: 0, tickNumber: 4, disableLine: true, disableTicks: true, valueFormatter: (v: number) => fmt(v) }];
  return (
    <div className="ledger-trend">
      <div className="chart-meta"><span>Amount · Ks</span><span>{data.length === 1 ? `Daily comparison · ${data[0].label}` : `${data.length} reporting days`}</span></div>
      {data.length === 1 ? (
        <MuiBarChart height={270} dataset={data} series={series} borderRadius={5} hideLegend
          xAxis={[{ scaleType: "band", dataKey: "label", categoryGapRatio: 0.65, barGapRatio: 0.25, disableLine: true, disableTicks: true }]}
          yAxis={yAxis} grid={{ horizontal: true }} margin={{ top: 16, right: 16, bottom: 8 }}
          slotProps={{ tooltip: { trigger: "item" } }} sx={chartStyle} />
      ) : (
        <LineChart height={270} dataset={data} hideLegend
          xAxis={[{ scaleType: "point", dataKey: "label", disableLine: true, disableTicks: true, tickLabelInterval: (_v, i) => i % Math.max(1, Math.ceil(data.length / 7)) === 0 }]}
          yAxis={yAxis}
          series={series.map((s) => ({ ...s, area: true, curve: "linear" as const, showMark: data.length <= 14 }))}
          grid={{ horizontal: true }} margin={{ top: 16, right: 24, bottom: 8 }}
          sx={{ ...chartStyle, "& .MuiAreaElement-series-revenue": { fill: `url(#${id}-revenue)` }, "& .MuiAreaElement-series-expense": { fill: `url(#${id}-expense)` } }}>
          <defs>{[LEAF, RED].map((color, i) => <linearGradient key={color} id={`${id}-${i === 0 ? "revenue" : "expense"}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.16} /><stop offset="100%" stopColor={color} stopOpacity={0.01} /></linearGradient>)}</defs>
        </LineChart>
      )}
      <div className="chart-legend"><span><i style={{ background: LEAF }} />Revenue</span><span><i style={{ background: RED }} />Expense</span></div>
      {data.length === 1 && <p className="chart-note">One reporting day in this period. A trend appears as more days are recorded.</p>}
    </div>
  );
}

export function DonutChart({ slices }: { slices: { label: string; value: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const active = hover === null ? null : slices[hover];
  const percent = (value: number) => total > 0 ? `${(value / total * 100).toFixed(1)}%` : "0%";
  return (
    <div className="payment-chart">
      <div className="payment-ring">
        {total > 0 ? <PieChart width={196} height={196} hideLegend colors={COLORS}
          series={[{ id: "payment", data: slices.map((s, i) => ({ ...s, id: i })), innerRadius: 72, outerRadius: 94, paddingAngle: 3, cornerRadius: 4,
            highlightScope: { highlight: "item", fade: "global" }, valueFormatter: (s) => `${fmt(s.value)} Ks · ${percent(s.value)}` }]}
          highlightedItem={hover === null ? null : { seriesId: "payment", dataIndex: hover }}
          onHighlightChange={(h) => setHover(h?.dataIndex ?? null)} margin={0} /> : <div className="payment-ring-empty" />}
        <div className="payment-center"><span>{active ? percent(active.value) : slices.filter(s => s.value > 0).length}</span><small>{active ? active.label : "payment methods"}</small></div>
      </div>
      <div className="payment-detail">
        <div className="payment-total"><span>Total revenue</span><strong>{fmt(total)} <small>Ks</small></strong></div>
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
  if (!data.length) return <p className="chart-note">No data for this period.</p>;
  return (
    <div className="ranked-chart">
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
