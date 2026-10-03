"use client";

import { useEffect, useRef } from "react";

/** Brief ease-out count-up; the accessible value is always the exact total. */
export function AnimatedStatValue({ value }: { value: string }) {
  const element = useRef<HTMLSpanElement>(null);
  const current = useRef(0);
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    const match = value.match(/^([−-]?[\d,]+(?:\.\d+)?)(.*)$/);
    const target = match ? Number(match[1].replaceAll(",", "").replace("−", "-")) : NaN;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const finish = () => { cancelAnimationFrame(frame); node.textContent = value; current.current = Number.isFinite(target) ? target : 0; };
    if (!match || !Number.isFinite(target) || preference.matches) { finish(); return; }
    const from = current.current;
    const decimals = match[1].split(".")[1]?.length ?? 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 800);
      current.current = from + (target - from) * (1 - Math.pow(1 - progress, 3));
      node.textContent = current.current.toLocaleString("en-US", {minimumFractionDigits:decimals, maximumFractionDigits:decimals}) + match[2];
      if (progress < 1) frame = requestAnimationFrame(tick); else finish();
    };
    frame = requestAnimationFrame(tick);
    const onPreference = () => { if (preference.matches) finish(); };
    preference.addEventListener("change", onPreference);
    return () => { cancelAnimationFrame(frame); preference.removeEventListener("change", onPreference); };
  }, [value]);
  return <span aria-label={value} style={{fontVariantNumeric:"tabular-nums"}}><span ref={element} aria-hidden="true">{value}</span></span>;
}
