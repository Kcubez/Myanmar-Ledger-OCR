"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { getLedger, listLedgers, removeLedger, saveLedger, type LedgerRow, type SavedLedger } from "../lib/storage";

const types = ["image/jpeg", "image/png", "image/webp"];
type KeyState = "working" | "rate_limited" | "invalid" | "unavailable";
type KeyInfo = { slot: number; masked: string; state: KeyState };
type UsedKey = { slot: number; masked: string };
type LegacyRow = { id: string; date?: string; income?: string; expense?: string; description?: string };
type LedgerForMigration = Omit<SavedLedger, "columns" | "rows"> & { columns?: string[]; rows: Array<LedgerRow | LegacyRow> };
const defaultColumns = ["နေ့စွဲ", "ဝင်ငွေ", "ထွက်ငွေ", "အကြောင်းအရာ"];
const emptyRow = (columnCount: number): LedgerRow => ({ id: crypto.randomUUID(), values: Array.from({ length: columnCount }, () => "") });
const readableDate = (iso: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
function numberFrom(value: string) { const normalized = value.replace(/[၀-၉]/g, (c) => String("၀၁၂၃၄၅၆၇၈၉".indexOf(c))).replace(/[^0-9.-]/g, ""); return Number(normalized) || 0; }
function findColumn(columns: string[], expression: RegExp) { return columns.findIndex((column) => expression.test(column)); }
function normalizeLedger(item: LedgerForMigration): SavedLedger {
  const columns = item.columns?.length ? item.columns : defaultColumns;
  const rows = item.rows.map((row) => "values" in row ? { ...row, values: Array.from({ length: columns.length }, (_, index) => row.values[index] ?? "") } : { id: row.id, values: [row.date ?? "", row.income ?? "", row.expense ?? "", row.description ?? ""] });
  return { ...item, columns, rows };
}

export default function LedgerWorkspace() {
  const [saved, setSaved] = useState<SavedLedger[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [record, setRecord] = useState<SavedLedger | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const imageUrlRef = useRef("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [testingKeys, setTestingKeys] = useState(false);
  const [showKeyIds, setShowKeyIds] = useState(false);
  const [keyStatus, setKeyStatus] = useState("");
  const [usedKey, setUsedKey] = useState<UsedKey | null>(null);

  const refresh = async () => setSaved((await listLedgers()).map(normalizeLedger).reverse());
  useEffect(() => {
    void listLedgers().then((items) => setSaved(items.map(normalizeLedger).reverse()));
    void fetch("/api/keys/status").then((response) => response.ok ? response.json() : { keys: [] }).then((data: { keys?: KeyInfo[] }) => setKeys(data.keys ?? [])).catch(() => setKeys([]));
  }, []);
  function setActiveRecord(next: SavedLedger | null) {
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    const url = next?.image ? URL.createObjectURL(next.image) : "";
    imageUrlRef.current = url;
    setImageUrl(url);
    setRecord(next);
  }
  const totals = useMemo(() => {
    const incomeIndex = findColumn(record?.columns ?? [], /ဝင်ငွေ|income|revenue/i);
    const expenseIndex = findColumn(record?.columns ?? [], /ထွက်ငွေ|expense|cost/i);
    return (record?.rows ?? []).reduce((acc, row) => ({ income: acc.income + numberFrom(incomeIndex < 0 ? "" : row.values[incomeIndex]), expense: acc.expense + numberFrom(expenseIndex < 0 ? "" : row.values[expenseIndex]) }), { income: 0, expense: 0 });
  }, [record]);
  const setRows = (rows: LedgerRow[]) => setRecord((current) => current ? { ...current, rows } : current);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    setStatus(""); setFile(null);
    if (!chosen) return;
    if (!types.includes(chosen.type) || chosen.size > 10 * 1024 * 1024) { setStatus("JPG, PNG, WEBP နှင့် 10 MB အောက်ပုံသာ တင်ပါ။"); return; }
    setFile(chosen);
  }
  async function extract() {
    if (!file) return;
    setBusy(true); setStatus(""); setUsedKey(null);
    try {
      const data = new FormData(); data.append("image", file);
      const response = await fetch("/api/extract", { method: "POST", body: data });
      const payload = await response.json() as { error?: string; rawText?: string; columns?: string[]; rows?: string[][]; usedKey?: UsedKey };
      if (!response.ok) throw new Error(payload.error ?? "Extraction failed.");
      const now = new Date().toISOString();
      const columns = payload.columns?.length ? payload.columns : defaultColumns;
      setActiveRecord({ id: crypto.randomUUID(), image: file, imageName: file.name, imageType: file.type, rawText: payload.rawText ?? "", columns, rows: (payload.rows ?? []).map((values) => ({ values: Array.from({ length: columns.length }, (_, index) => values[index] ?? ""), id: crypto.randomUUID() })), createdAt: now, updatedAt: now });
      setUsedKey(payload.usedKey ?? null);
      setStatus("Extracted. Review and save when ready.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Extraction failed."); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!record) return;
    const updated = { ...record, updatedAt: new Date().toISOString() };
    await saveLedger(updated); setRecord(updated); await refresh(); setStatus("Browser ထဲမှာ သိမ်းပြီးပါပြီ။");
  }
  async function open(id: string) { const item = await getLedger(id); if (item) { setActiveRecord(normalizeLedger(item)); setFile(null); setStatus(""); } }
  async function deleteItem(id: string) { if (!confirm("ဒီ result ကိုဖျက်မလား?")) return; await removeLedger(id); if (record?.id === id) setActiveRecord(null); await refresh(); }
  const updateCell = (id: string, index: number, value: string) => setRows((record?.rows ?? []).map((row) => row.id === id ? { ...row, values: row.values.map((cell, cellIndex) => cellIndex === index ? value : cell) } : row));
  const renameColumn = (index: number, value: string) => setRecord((current) => current ? { ...current, columns: current.columns.map((column, columnIndex) => columnIndex === index ? value : column) } : current);
  const addColumn = () => setRecord((current) => current ? { ...current, columns: [...current.columns, "Column အသစ်"], rows: current.rows.map((row) => ({ ...row, values: [...row.values, ""] })) } : current);
  const removeColumn = (index: number) => setRecord((current) => current && current.columns.length > 1 ? { ...current, columns: current.columns.filter((_, columnIndex) => columnIndex !== index), rows: current.rows.map((row) => ({ ...row, values: row.values.filter((_, valueIndex) => valueIndex !== index) })) } : current);
  async function testKeys() {
    setTestingKeys(true); setKeyStatus("");
    try {
      const response = await fetch("/api/keys/status", { method: "POST" });
      const data = await response.json() as { keys?: KeyInfo[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Key test failed.");
      setKeys(data.keys ?? []); setKeyStatus("Key test ပြီးပါပြီ။");
    } catch (error) { setKeyStatus(error instanceof Error ? error.message : "Key test failed."); }
    finally { setTestingKeys(false); }
  }
  const keyLabel: Record<KeyState, string> = { working: "Working", rate_limited: "Rate limited", invalid: "Invalid", unavailable: "Not tested" };

  return <div className="shell">
    <header><p className="eyebrow">MYANMAR LEDGER OCR</p><h1>စာရင်းစာရွက်ကို ဖတ်ထုတ်ပါ</h1><p>ပုံတင်ပါ၊ Gemini ဖြင့်ဖတ်ထုတ်ပါ၊ browser ထဲမှာသာ ပြန်စစ်ပြီးသိမ်းပါ။</p></header>
    <section className="key-panel card"><div><p className="eyebrow">GEMINI KEY STATUS</p><h2>Configured API keys</h2></div><div className="key-actions"><button className="secondary" aria-label="Toggle masked key identifiers" onClick={() => setShowKeyIds(!showKeyIds)}>{showKeyIds ? "◉ Hide IDs" : "◉ Show IDs"}</button><button onClick={() => void testKeys()} disabled={testingKeys || !keys.length}>{testingKeys ? "Testing…" : "Test all keys"}</button></div><div className="key-list">{keys.length ? keys.map((key) => <div className="key-row" key={key.slot}><label>Key {key.slot}</label><output>{showKeyIds ? key.masked : "••••••••••••"}</output><span className={`key-state ${key.state}`}>{keyLabel[key.state]}</span></div>) : <p className="muted">No configured keys found.</p>}</div>{keyStatus && <p className="status">{keyStatus}</p>}</section>
    <section className="upload card"><label className="file"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile} />ပုံရွေးပါ</label><span>{file?.name ?? "JPG, PNG, WEBP · 10 MB အထိ"}</span><button onClick={extract} disabled={!file || busy}>{busy ? "ဖတ်ထုတ်နေသည်…" : "Gemini ဖြင့် ဖတ်ထုတ်ပါ"}</button>{status && <p className="status">{status}</p>}</section>
    <div className="workspace">
      <aside className="card saved"><h2>သိမ်းထားသော results</h2>{saved.length ? saved.map((item) => <div className="saved-item" key={item.id}><button className="text-btn" onClick={() => void open(item.id)}>{item.imageName}<small>{readableDate(item.updatedAt)}</small></button><button aria-label="Delete result" className="delete" onClick={() => void deleteItem(item.id)}>×</button></div>) : <p className="muted">မသိမ်းရသေးပါ။</p>}</aside>
      <section className="card editor"><div className="editor-title"><div><h2>Result editor</h2><p className="muted">စာရွက်ပေါ်က column များကို edit, add, delete လုပ်နိုင်သည်။</p>{usedKey && <p className="used-key">ဒီ result ကို Key {usedKey.slot} ({usedKey.masked}) နဲ့ ဖတ်ထုတ်ခဲ့သည်။</p>}</div>{record && <button onClick={() => void save()}>Save result</button>}</div>{record ? <>
        <div className="result-grid"><div>{imageUrl && <Image unoptimized className="preview" src={imageUrl} width={800} height={600} alt="Original uploaded ledger" />}</div><textarea value={record.rawText} onChange={(e) => setRecord({ ...record, rawText: e.target.value })} aria-label="Raw extracted text" placeholder="Raw extracted text" /></div>
        <div className="table-wrap"><table><thead><tr>{record.columns.map((column, index) => <th key={`${index}-${column}`}><div className="column-heading"><input aria-label={`Column ${index + 1} name`} value={column} onChange={(e) => renameColumn(index, e.target.value)} /><button className="delete" aria-label={`Delete ${column} column`} onClick={() => removeColumn(index)}>×</button></div></th>)}<th /></tr></thead><tbody>{record.rows.map((row) => <tr key={row.id}>{record.columns.map((column, index) => <td key={`${row.id}-${column}-${index}`}><input value={row.values[index] ?? ""} onChange={(e) => updateCell(row.id, index, e.target.value)} /></td>)}<td><button className="delete" onClick={() => setRows(record.rows.filter((item) => item.id !== row.id))}>×</button></td></tr>)}</tbody></table></div>
        <div className="editor-actions"><button className="secondary" onClick={() => setRows([...(record.rows), emptyRow(record.columns.length)])}>+ Row ထည့်ပါ</button><button className="secondary" onClick={addColumn}>+ Column ထည့်ပါ</button></div><div className="totals"><span>စုစုပေါင်းဝင်ငွေ <b>{totals.income.toLocaleString()}</b></span><span>စုစုပေါင်းထွက်ငွေ <b>{totals.expense.toLocaleString()}</b></span><span>အမြတ်ငွေ <b>{(totals.income - totals.expense).toLocaleString()}</b></span></div>
      </> : <div className="empty">ပုံတင်ပြီး ဖတ်ထုတ်လျှင် result ကို ဒီမှာပြမယ်။</div>}</section>
    </div>
  </div>;
}
