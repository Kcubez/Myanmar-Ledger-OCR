"use client";

import { useRef, useState } from "react";
import type { CSSProperties } from "react";

const MM_DIGITS = "၀၁၂၃၄၅၆၇၈၉";

/** Strip grouping/commas/junk → plain digit string ("" stays ""). Exported for tests. */
export function cleanAmountText(raw: string, allowDecimal: boolean): string {
  const ascii = raw.replace(/[၀-၉]/g, (d) => String(MM_DIGITS.indexOf(d)));
  if (allowDecimal) {
    const cleaned = ascii.replace(/[^0-9.]/g, "");
    const [head, ...rest] = cleaned.split(".");
    return rest.length > 0 ? `${head}.${rest.join("")}` : cleaned;
  }
  return ascii.replace(/[^0-9]/g, "");
}

/** Insert grouping commas without touching the digits (leading zeros survive
 *  while typing — "000000" → "000,000", never collapsed to "0" mid-edit). */
const groupInt = (head: string): string => head.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Plain digit string → grouped display text ("" stays ""). Exported for tests. */
export function formatAmountText(digits: string, allowDecimal: boolean): string {
  if (digits === "" || digits === ".") return "";
  if (allowDecimal) {
    const [head, ...rest] = digits.split(".");
    const int = head === "" ? "0" : groupInt(head);
    if (rest.length === 0) return digits.endsWith(".") ? `${int}.` : int;
    return `${int}.${rest.join("")}`;
  }
  return groupInt(digits);
}

/** Map caret from pre-format text to post-format text by digit count. */
function mapCaret(before: string, formatted: string, allowDecimal: boolean): number {
  const digits = before.replace(/[^0-9]/g, "").length;
  const dot = allowDecimal && before.includes(".");
  let seen = 0;
  let dotPassed = false;
  let i = 0;
  for (; i < formatted.length; i++) {
    if (seen >= digits && (!dot || dotPassed)) break;
    const ch = formatted[i];
    if (ch >= "0" && ch <= "9") seen++;
    else if (ch === "." && allowDecimal) dotPassed = true;
  }
  return i;
}

const toText = (value: number | null, allowDecimal: boolean): string =>
  value === null || Number.isNaN(value) ? "" : formatAmountText(String(value), allowDecimal);

const parse = (text: string): number | null =>
  text === "" || text === "." ? null : Number(text.replace(/,/g, ""));

/**
 * Kyat/gallon amount input: live thousand-separator grouping while typing,
 * caret preserved, clearing the field stays empty (never snaps to 0).
 * Numeric conversion happens on change/blur only — callers keep null ⟺ 0 mapping.
 */
export function AmountInput({
  value,
  onChange,
  allowDecimal = false,
  style,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  allowDecimal?: boolean;
  style?: CSSProperties;
}) {
  const [text, setText] = useState(() => toText(value, allowDecimal));
  const [synced, setSynced] = useState<number | null>(value ?? null);
  const ref = useRef<HTMLInputElement>(null);

  // Resync only when the external value actually changes (e.g. modal load) —
  // never while the user is typing the same number (parsed text still matches).
  if ((value ?? null) !== synced) {
    setSynced(value ?? null);
    if (parse(text) !== (value ?? null)) setText(toText(value ?? null, allowDecimal));
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const el = e.target;
    const caret = el.selectionStart ?? el.value.length;
    const cleaned = cleanAmountText(el.value, allowDecimal);
    const formatted = formatAmountText(cleaned, allowDecimal);
    const pos = mapCaret(cleanAmountText(el.value.slice(0, caret), allowDecimal), formatted, allowDecimal);
    setText(formatted);
    requestAnimationFrame(() => {
      try {
        el.setSelectionRange(pos, pos);
      } catch {
        /* non-text input fallback — ignore */
      }
    });
    onChange(parse(cleaned));
  }

  return (
    <input
      ref={ref}
      value={text}
      inputMode={allowDecimal ? "decimal" : "numeric"}
      autoComplete="off"
      style={style}
      onChange={handleChange}
      onBlur={() => setText(toText(parse(text), allowDecimal))}
    />
  );
}
