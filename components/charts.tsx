"use client";

/**
 * Zero-dependency SVG charts (BAI monthly-demand-chart pattern).
 * No recharts/d3 — keeps the Vercel bundle small.
 */
import { useState } from "react";

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K` : `${n}`;

export function TrendChart({ data }: { data: { label: string; a: number; b: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 680;
  const h = 260;
  const pad = { top: 20, right: 16, bottom: 36, left: 52 };
  const pw = w - pad.left - pad.right;
  const ph = h - pad.top - pad.bottom;
  const max = Math.max(...data.map((d) => Math.max(d.a, d.b)), 1);
  const x = (i: number) => pad.left + (pw / Math.max(data.length - 1, 1)) * i;
  const y = (v: number) => pad.top + ph - (v / max) * ph;
  const line = (key: "a" | "b") => data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(d[key])}`).join(" ");
  const ticks = [0, 1, 2, 3, 4].map((i) => ({ v: Math.round((max / 4) * (4 - i)), y: pad.top + (ph / 4) * i }));
  const every = Math.max(1, Math.ceil(data.length / 12));
  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label="Revenue vs expense trend"
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t.y}>
            <line x1={pad.left} x2={w - pad.right} y1={t.y} y2={t.y} stroke="#d8e1d8" strokeWidth="1" />
            <text x={pad.left - 8} y={t.y + 4} textAnchor="end" fontSize="11" fill="#5f6f63">
              {fmt(t.v)}
            </text>
          </g>
        ))}
        <path d={line("a")} fill="none" stroke="#21633e" strokeWidth="3" strokeLinecap="round" />
        <path d={line("b")} fill="none" stroke="#a63434" strokeWidth="3" strokeLinecap="round" />
        {data.map((d, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(d.a)} r={hover === i ? 5 : 3} fill="#21633e" />
            <circle cx={x(i)} cy={y(d.b)} r={hover === i ? 5 : 3} fill="#a63434" />
            {i % every === 0 && (
              <text x={x(i)} y={h - 12} textAnchor="middle" fontSize="11" fill="#5f6f63">
                {d.label}
              </text>
            )}
            <rect
              x={x(i) - pw / Math.max(data.length, 1) / 2}
              y={pad.top}
              width={pw / Math.max(data.length, 1)}
              height={ph}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          </g>
        ))}
        {hover !== null && data[hover] && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + ph} stroke="#91c5a1" strokeDasharray="4 3" />
            <text x={x(hover)} y={pad.top - 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="#17241b">
              {data[hover].label}: {fmt(data[hover].a)} / {fmt(data[hover].b)}
            </text>
          </g>
        )}
      </svg>
      <p className="muted" style={{ margin: "4px 0 0" }}>
        <span style={{ color: "#21633e" }}>● Revenue</span> · <span style={{ color: "#a63434" }}>● Expense</span>
      </p>
    </div>
  );
}

const DONUT_COLORS = ["#21633e", "#4d9a6b", "#8fc7a4", "#c98a2b", "#a63434"];

export function DonutChart({ slices }: { slices: { label: string; value: number }[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = 70;
  const c = 2 * Math.PI * r;
  const segments = slices.map((s, i) => {
    const frac = s.value / total;
    const offset = slices.slice(0, i).reduce((sum, prev) => sum + prev.value / total, 0);
    return { ...s, frac, offset, color: DONUT_COLORS[i % DONUT_COLORS.length] };
  });
  return (
    <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
      <svg viewBox="0 0 180 180" style={{ width: 170, height: 170 }} role="img" aria-label="Payment split">
        <circle cx="90" cy="90" r={r} fill="none" stroke="#f0f6f1" strokeWidth="26" />
        {segments.map((s) => (
          <circle
            key={s.label}
            cx="90"
            cy="90"
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth="26"
            strokeDasharray={`${s.frac * c} ${c}`}
            strokeDashoffset={-s.offset * c}
            transform="rotate(-90 90 90)"
          />
        ))}
        <text x="90" y="86" textAnchor="middle" fontSize="18" fontWeight="800" fill="#17241b">
          {fmt(total)}
        </text>
        <text x="90" y="104" textAnchor="middle" fontSize="11" fill="#5f6f63">
          Total
        </text>
      </svg>
      <div style={{ display: "grid", gap: 6, fontSize: ".88rem" }}>
        {segments.map((s) => (
          <span key={s.label}>
            <span style={{ color: s.color }}>●</span> {s.label}{" "}
            <b>{fmt(s.value)}</b> <span className="muted">({Math.round((s.value / total) * 100)}%)</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function BarChart({ data, color = "#21633e" }: { data: { label: string; value: number }[]; color?: string }) {
  const w = 680;
  const rowH = 30;
  const h = Math.max(data.length * rowH + 16, 60);
  const max = Math.max(...data.map((d) => d.value), 1);
  const labelW = 150;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Bar chart">
      {data.map((d, i) => {
        const bw = ((w - labelW - 90) * d.value) / max;
        return (
          <g key={`${d.label}-${i}`}>
            <text x={0} y={i * rowH + 21} fontSize="12" fill="#17241b">
              {d.label.length > 20 ? `${d.label.slice(0, 19)}…` : d.label}
            </text>
            <rect x={labelW} y={i * rowH + 6} width={Math.max(bw, 2)} height={18} rx={4} fill={color} />
            <text x={labelW + bw + 8} y={i * rowH + 21} fontSize="12" fill="#5f6f63">
              {fmt(d.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
