"use client";

import { Children, isValidElement, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

type Cell = { children?: ReactNode; "data-label"?: string };
function cells(row: ReactNode) { return isValidElement<Cell>(row) ? Children.toArray(row.props.children).filter(isValidElement<Cell>) : []; }
function text(node: ReactNode): string { return Children.toArray(node).map(n => isValidElement<Cell>(n) ? text(n.props.children) : String(n)).join(" "); }
export function PaginatedTable({ children, className = "responsive-ledger", searchable = false, searchPlaceholder = "Search records…", title, titleMeta, headerActions }: { children: ReactNode; className?: string; role?: string; searchable?: boolean; searchPlaceholder?: string; title?: string; titleMeta?: string; headerActions?: ReactNode }) {
  const filter = useSearchParams().toString();
  return <TablePages key={filter} className={className} searchable={searchable} searchPlaceholder={searchPlaceholder} title={title} titleMeta={titleMeta} headerActions={headerActions}>{children}</TablePages>;
}
function TablePages({ children, className, searchable, searchPlaceholder = "Search records…", title, titleMeta, headerActions }: { children: ReactNode; className: string; searchable: boolean; searchPlaceholder?: string; title?: string; titleMeta?: string; headerActions?: ReactNode }) {
  const [page, setPage] = useState(0), [query, setQuery] = useState("");
  const size = 10;
  const root = useRef<HTMLDivElement>(null);
  const parts = Children.toArray(children);
  const body = parts.find(part => isValidElement(part) && part.type === "tbody");
  const all = isValidElement<Cell>(body) ? Children.toArray(body.props.children) : [];
  const rows = all.filter(row => !query || cells(row).some(c => text(c.props.children).toLowerCase().includes(query.toLowerCase())))
    .sort((a,b) => { const date = (r: ReactNode) => text(cells(r).find(c => c.props["data-label"] === "Date")?.props.children); return date(b).localeCompare(date(a)); });
  const last = Math.max(0, Math.ceil(rows.length / size) - 1), current = Math.min(page, last);
  const visible = rows.slice(current * size, current * size + size);
  function move(next: number) { setPage(next); root.current?.scrollIntoView({ block:"start", behavior:"smooth" }); }
  return <div ref={root} className="paginated-records">
    {(title || searchable) && <div className="table-header-row">{title ? <div className="table-title"><h2>{title}</h2>{titleMeta && <p className="muted">{titleMeta}</p>}{headerActions}</div> : <span />}{searchable && <div className="table-tools"><label className="table-search" aria-label="Search records"><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg><input aria-label="Search records" placeholder={searchPlaceholder} value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} />{query && <button type="button" className="table-search-clear" aria-label="Clear search" onClick={() => { setQuery(""); setPage(0); }}>×</button>}</label></div>}</div>}
    <table className={`${className} desktop-records`} role="table">{parts.filter(part => part !== body)}<tbody>{visible}</tbody></table>
    <div className="mobile-records">{visible.map((row,index) => {
      const entries = cells(row), value = (c: typeof entries[number]) => c.props.children;
      const primary = entries.filter(c => /^(Date|Name|Vehicle name|Particular|Total|Amount(?: \(Ks\))?|Balance|Unit)$/.test(c.props["data-label"] ?? ""));
      return <article className="mobile-record" key={isValidElement(row) ? row.key : index}>
        <div className="record-summary">{primary.map((c,i) => <div key={i}><span>{c.props["data-label"]}</span><strong>{value(c)}</strong></div>)}</div>
        <details><summary>Details & actions</summary><dl>{entries.filter(c => !primary.includes(c)).map((c,i) => <div key={i}><dt>{c.props["data-label"]}</dt><dd>{value(c)}</dd></div>)}</dl></details>
      </article>;
    })}</div>
    {!rows.length && (
      <div className="table-empty" role="status">
        <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        <p>{query ? "No records match your search." : "No records yet."}</p>
        {query && <button type="button" className="secondary" onClick={() => { setQuery(""); setPage(0); }}>Clear search</button>}
      </div>
    )}
    <nav className="table-pagination" aria-label="Table pagination"><span aria-live="polite">{rows.length ? current*size+1 : 0}–{Math.min((current+1)*size,rows.length)} of {rows.length}</span><button className="secondary" disabled={!current} onClick={()=>move(current-1)}>Previous</button><span>{current+1} / {last+1}</span><button className="secondary" disabled={current===last} onClick={()=>move(current+1)}>Next</button></nav>
  </div>;
}
