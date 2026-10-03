"use client";

import { Children, isValidElement, useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { TablePage } from "../lib/table-page";

type Cell = { children?: ReactNode; "data-label"?: string; "data-iso"?: string };
function cells(row: ReactNode) { return isValidElement<Cell>(row) ? Children.toArray(row.props.children).filter(isValidElement<Cell>) : []; }
function text(node: ReactNode): string { return Children.toArray(node).map(n => isValidElement<Cell>(n) ? text(n.props.children) : String(n)).join(" "); }
export function PaginatedTable({ children, className = "responsive-ledger", searchable = false, searchPlaceholder = "Search records…", title, titleMeta, pagination }: { children: ReactNode; className?: string; role?: string; searchable?: boolean; searchPlaceholder?: string; title?: string; titleMeta?: string; pagination?: TablePage }) {
  return <TablePages className={className} searchable={searchable} searchPlaceholder={searchPlaceholder} title={title} titleMeta={titleMeta} pagination={pagination}>{children}</TablePages>;
}
function TablePages({ children, className, searchable, searchPlaceholder = "Search records…", title, titleMeta, pagination }: { children: ReactNode; className: string; searchable: boolean; searchPlaceholder?: string; title?: string; titleMeta?: string; pagination?: TablePage }) {
  const [page, setPage] = useState(0), [query, setQuery] = useState(pagination?.query ?? "");
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [composing, setComposing] = useState(false);
  const serverQuery = pagination?.query ?? "";
  const [previousQuery, setPreviousQuery] = useState(serverQuery);
  // Keep the input mounted and preserve newer keystrokes while a response arrives.
  if (previousQuery !== serverQuery) {
    setPreviousQuery(serverQuery);
    if (!editing) setQuery(serverQuery);
    else if (query.trim() === serverQuery) setEditing(false);
  }
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const searchParams = params.toString();
  const pageParam = pagination?.pageParam ?? "page", queryParam = pagination?.queryParam ?? "query";
  const navigate = useCallback((next: number, search: string) => {
    const url = new URLSearchParams(searchParams);
    url.set(pageParam, String(next + 1));
    if (search) url.set(queryParam, search);
    else url.delete(queryParam);
    startTransition(() => router.replace(`${pathname}?${url}`, { scroll: false }));
  }, [searchParams, pageParam, queryParam, pathname, router]);
  const needsSearch = Boolean(pagination && editing && query.trim() !== serverQuery);
  useEffect(() => {
    if (!needsSearch || composing) return;
    const timer = setTimeout(() => navigate(0, query.trim()), 350);
    return () => clearTimeout(timer);
  }, [needsSearch, composing, query, navigate]);
  const size = 10;
  const root = useRef<HTMLDivElement>(null);
  const parts = Children.toArray(children);
  const body = parts.find(part => isValidElement(part) && part.type === "tbody");
  const all = isValidElement<Cell>(body) ? Children.toArray(body.props.children) : [];
  const rows = pagination ? all : all.filter(row => !query || cells(row).some(c => text(c.props.children).toLowerCase().includes(query.toLowerCase())))
    .sort((a,b) => { const date = (r: ReactNode) => { const found = cells(r).find(c => c.props["data-label"] === "Date"); return found?.props["data-iso"] ?? text(found?.props.children); }; return date(b).localeCompare(date(a)); });
  const total = pagination?.total ?? rows.length;
  const last = Math.max(0, Math.ceil(total / size) - 1), current = pagination ? pagination.page - 1 : Math.min(page, last);
  const visible = pagination ? rows : rows.slice(current * size, current * size + size);
  function move(next: number) { if (pagination) navigate(next, query.trim()); else setPage(next); root.current?.scrollIntoView({ block:"start", behavior:"smooth" }); }
  const updating = pending || needsSearch;
  return <div ref={root} className="paginated-records" aria-busy={updating}>
    {(title || searchable) && <div className="table-header-row">
      {title ? <div className="table-title"><h2>{title}</h2>{titleMeta && <p className="muted">{titleMeta}</p>}</div> : <span />}
      {searchable && <form className="table-tools" onSubmit={event => { event.preventDefault(); }}>
        <label className="table-search">
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input type="text" role="searchbox" aria-label={searchPlaceholder} placeholder={searchPlaceholder} value={query} autoComplete="off" onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} onChange={event => { setQuery(event.target.value); setEditing(true); setPage(0); }} />
          {query && <button type="button" className="table-search-clear" aria-label="Clear search" onClick={() => { setQuery(""); setEditing(true); setPage(0); }}>×</button>}
        </label>
      </form>}
    </div>}
    
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
        {query && <button type="button" className="secondary" onClick={() => { setQuery(""); setEditing(true); setPage(0); }}>Clear search</button>}
      </div>
    )}
    <nav className="table-pagination" aria-label="Table pagination"><span aria-live="polite">{total ? current*size+1 : 0}–{Math.min((current+1)*size,total)} of {total}</span><button className="secondary" disabled={!current || updating} onClick={()=>move(current-1)}>Previous</button><span>{current+1} / {last+1}</span><button className="secondary" disabled={current===last || updating} onClick={()=>move(current+1)}>Next</button></nav>
  </div>;
}
