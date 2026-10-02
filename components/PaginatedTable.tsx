"use client";

import { Children, isValidElement, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

/** Server-rendered rows remain accessible, ten at a time; totals use the full dataset. */
export function PaginatedTable({ children, className = "responsive-ledger" }: { children: ReactNode; className?: string; role?: string }) {
  const filter = useSearchParams().toString();
  return <TablePages key={filter} className={className}>{children}</TablePages>;
}
function TablePages({ children, className }: { children: ReactNode; className: string }) {
  const [page, setPage] = useState(0);
  const parts = Children.toArray(children);
  const body = parts.find(part => isValidElement(part) && part.type === "tbody");
  const rows = isValidElement<{ children: ReactNode }>(body) ? Children.toArray(body.props.children) : [];
  const last = Math.max(0, Math.ceil(rows.length / 10) - 1);
  const current = Math.min(page, last);
  return <>
    <table className={className} role="table">
      {parts.filter(part => part !== body)}
      <tbody>{rows.slice(current * 10, current * 10 + 10)}</tbody>
    </table>
    {rows.length > 10 && <nav className="table-pagination" aria-label="Table pagination">
      <span aria-live="polite">{current * 10 + 1}–{Math.min(current * 10 + 10, rows.length)} of {rows.length}</span>
      <button className="secondary" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button>
      <span>Page {current + 1} of {last + 1}</span>
      <button className="secondary" disabled={current === last} onClick={() => setPage(current + 1)}>Next</button>
    </nav>}
  </>;
}
