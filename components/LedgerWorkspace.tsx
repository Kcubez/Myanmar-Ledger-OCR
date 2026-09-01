"use client";

import Image from "next/image";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { getLedger, listLedgers, removeLedger, saveLedger, type LedgerRow, type SavedLedger, type StoredImage } from "../lib/storage";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const COLUMNS = ["နေ့စွဲ", "ဝင်ငွေ", "ထွက်ငွေ", "အမြတ်", "အရှုံး"];
const MAX_FILE_SIZE = 4 * 1024 * 1024;
const MAX_TOTAL_SIZE = 20 * 1024 * 1024;
type KeyState = "working" | "rate_limited" | "invalid" | "unavailable";
type KeyInfo = { slot: number; masked: string; state: KeyState };
type UsedKey = { slot: number; masked: string };
type LegacyLedger = Omit<SavedLedger, "images" | "columns" | "rows"> & { image?: Blob; imageName?: string; imageType?: string; images?: StoredImage[]; columns?: string[]; rows: LedgerRow[] };

const emptyRow = (): LedgerRow => ({ id: crypto.randomUUID(), values: Array.from({ length: COLUMNS.length }, () => "") });
const readableDate = (iso: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
function numberFrom(value: string) { const normalized = value.replace(/[၀-၉]/g, (character) => String("၀၁၂၃၄၅၆၇၈၉".indexOf(character))).replace(/[^0-9.-]/g, ""); return Number(normalized) || 0; }
function normalizeLedger(item: LegacyLedger): SavedLedger {
  const images = item.images?.length ? item.images : item.image ? [{ id: "legacy-image", blob: item.image, name: item.imageName ?? "ledger image", type: item.imageType ?? "image/jpeg", status: "success" as const }] : [];
  const oldColumns = item.columns ?? COLUMNS;
  const find = (expression: RegExp) => oldColumns.findIndex((column) => expression.test(column));
  const indexes = [find(/နေ့စွဲ|date/i), find(/ဝင်ငွေ|income|revenue/i), find(/ထွက်ငွေ|expense|cost/i), find(/အမြတ်|profit/i), find(/အရှုံး|loss/i)];
  return { ...item, images, columns: COLUMNS, rows: item.rows.map((row) => ({ ...row, values: indexes.map((index) => index >= 0 ? row.values[index] ?? "" : "") })) };
}

export default function LedgerWorkspace() {
  const [saved, setSaved] = useState<SavedLedger[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [record, setRecord] = useState<SavedLedger | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const imageUrlRef = useRef("");
  const [status, setStatus] = useState("");
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [batchErrors, setBatchErrors] = useState<string[]>([]);
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
  function setActiveRecord(next: SavedLedger | null, imageId?: string) {
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    const image = next?.images.find((item) => item.id === imageId) ?? next?.images[0];
    const url = image ? URL.createObjectURL(image.blob) : "";
    imageUrlRef.current = url; setImageUrl(url); setRecord(next);
  }
  const totals = useMemo(() => (record?.rows ?? []).reduce((acc, row) => ({ revenue: acc.revenue + numberFrom(row.values[1]), expense: acc.expense + numberFrom(row.values[2]), profit: acc.profit + numberFrom(row.values[3]), loss: acc.loss + numberFrom(row.values[4]) }), { revenue: 0, expense: 0, profit: 0, loss: 0 }), [record]);
  const setRows = (rows: LedgerRow[]) => setRecord((current) => current ? { ...current, rows } : current);

  function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []); event.target.value = ""; setStatus("");
    const candidate = [...files, ...selected];
    if (candidate.length > 5) { setStatus("ပုံအများဆုံး 5 ပုံသာရွေးနိုင်သည်။"); return; }
    if (candidate.some((file) => !ALLOWED_TYPES.includes(file.type) || file.size > MAX_FILE_SIZE)) { setStatus("ပုံတစ်ပုံသည် 4 MB ထက်မကြီးရပါ။ Vercel limit ကြောင့် ပိုသေးသောပုံရွေးပါ။"); return; }
    if (candidate.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_SIZE) { setStatus("ပုံအားလုံးစုစုပေါင်း 20 MB အောက်သာတင်ပါ။"); return; }
    setFiles(candidate);
  }
  async function extractBatch() {
    if (!files.length) return;
    setStatus(""); setBatchErrors([]); setUsedKey(null); setRecord(null);
    const images: StoredImage[] = []; const rows: LedgerRow[] = []; const rawText: string[] = []; const errors: string[] = [];
    for (const [index, file] of files.entries()) {
      const imageId = crypto.randomUUID(); setBatchProgress({ current: index + 1, total: files.length, name: file.name });
      try {
        const body = new FormData(); body.append("image", file);
        const response = await fetch("/api/extract", { method: "POST", body });
        const payload = await response.json() as { error?: string; rawText?: string; rows?: string[][]; usedKey?: UsedKey };
        if (!response.ok) throw new Error(payload.error ?? "Extraction failed.");
        images.push({ id: imageId, blob: file, name: file.name, type: file.type, status: "success" });
        rows.push(...(payload.rows ?? []).map((values) => ({ id: crypto.randomUUID(), sourceImageId: imageId, values: Array.from({ length: COLUMNS.length }, (_, cellIndex) => values[cellIndex] ?? "") })));
        rawText.push(`--- ${file.name} ---\n${payload.rawText ?? ""}`); setUsedKey(payload.usedKey ?? null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Extraction failed.";
        images.push({ id: imageId, blob: file, name: file.name, type: file.type, status: "failed", error: message }); errors.push(`${file.name}: ${message}`);
      }
    }
    setBatchProgress(null); setBatchErrors(errors);
    if (rows.length) {
      const now = new Date().toISOString();
      setActiveRecord({ id: crypto.randomUUID(), images, rawText: rawText.join("\n\n"), columns: COLUMNS, rows, createdAt: now, updatedAt: now });
      setStatus(errors.length ? `${rows.length} rows extracted; ${errors.length} image failed.` : `${rows.length} rows extracted from ${files.length} image(s).`);
    } else setStatus("No ledger rows were extracted. Review the image errors and try again.");
  }
  async function save() { if (!record) return; const updated = { ...record, updatedAt: new Date().toISOString() }; await saveLedger(updated); setRecord(updated); await refresh(); setStatus("Browser ထဲမှာ သိမ်းပြီးပါပြီ။"); }
  async function open(id: string) { const item = await getLedger(id); if (item) { setActiveRecord(normalizeLedger(item)); setFiles([]); setStatus(""); setBatchErrors([]); } }
  async function deleteItem(id: string) { if (!confirm("ဒီ result ကိုဖျက်မလား?")) return; await removeLedger(id); if (record?.id === id) setActiveRecord(null); await refresh(); }
  const updateCell = (id: string, index: number, value: string) => setRows((record?.rows ?? []).map((row) => row.id === id ? { ...row, values: row.values.map((cell, cellIndex) => cellIndex === index ? value : cell) } : row));
  async function testKeys() { setTestingKeys(true); setKeyStatus(""); try { const response = await fetch("/api/keys/status", { method: "POST" }); const data = await response.json() as { keys?: KeyInfo[]; error?: string }; if (!response.ok) throw new Error(data.error ?? "Key test failed."); setKeys(data.keys ?? []); setKeyStatus("Key test ပြီးပါပြီ။"); } catch (error) { setKeyStatus(error instanceof Error ? error.message : "Key test failed."); } finally { setTestingKeys(false); } }
  const keyLabel: Record<KeyState, string> = { working: "Working", rate_limited: "Rate limited", invalid: "Invalid", unavailable: "Not tested" };

  return <div className="shell">
    <header><p className="eyebrow">MYANMAR LEDGER OCR</p><h1>စာရင်းစာရွက်ကို ဖတ်ထုတ်ပါ</h1><p>ပုံ 1 မှ 5 ပုံအထိတင်ပြီး Revenue, Expense, Profit, Loss ကိုပြန်စစ်နိုင်သည်။</p></header>
    <section className="key-panel card"><div><p className="eyebrow">GEMINI KEY STATUS</p><h2>Configured API keys</h2></div><div className="key-actions"><button className="secondary" onClick={() => setShowKeyIds(!showKeyIds)}>{showKeyIds ? "◉ Hide IDs" : "◉ Show IDs"}</button><button onClick={() => void testKeys()} disabled={testingKeys || !keys.length}>{testingKeys ? "Testing…" : "Test all keys"}</button></div><div className="key-list">{keys.length ? keys.map((key) => <div className="key-row" key={key.slot}><label>Key {key.slot}</label><output>{showKeyIds ? key.masked : "••••••••••••"}</output><span className={`key-state ${key.state}`}>{keyLabel[key.state]}</span></div>) : <p className="muted">No configured keys found.</p>}</div>{keyStatus && <p className="status">{keyStatus}</p>}</section>
    <section className="upload card"><label className="file"><input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={chooseFiles} />ပုံရွေးပါ</label><span>{files.length ? `${files.length} / 5 ပုံရွေးထားသည်` : "JPG, PNG, WEBP · ပုံ 5 ပုံအထိ · တစ်ပုံ 4 MB"}</span><button onClick={() => void extractBatch()} disabled={!files.length || !!batchProgress}>{batchProgress ? `${batchProgress.current}/${batchProgress.total} ဖတ်ထုတ်နေသည်…` : "Gemini ဖြင့် ဖတ်ထုတ်ပါ"}</button>{files.length > 0 && <div className="file-list">{files.map((file, index) => <span key={`${file.name}-${index}`}>{file.name}<button className="delete" aria-label={`Remove ${file.name}`} disabled={!!batchProgress} onClick={() => setFiles(files.filter((_, itemIndex) => itemIndex !== index))}>×</button></span>)}</div>}{batchProgress && <p className="status">{batchProgress.name} ကို ဖတ်ထုတ်နေသည်…</p>}{status && <p className="status">{status}</p>}{batchErrors.length > 0 && <ul className="batch-errors">{batchErrors.map((error) => <li key={error}>{error}</li>)}</ul>}</section>
    <div className="workspace"><aside className="card saved"><h2>သိမ်းထားသော results</h2>{saved.length ? saved.map((item) => <div className="saved-item" key={item.id}><button className="text-btn" onClick={() => void open(item.id)}>{item.images.length} image(s) · {readableDate(item.updatedAt)}<small>{item.rows.length} rows</small></button><button aria-label="Delete result" className="delete" onClick={() => void deleteItem(item.id)}>×</button></div>) : <p className="muted">မသိမ်းရသေးပါ။</p>}</aside>
      <section className="card editor"><div className="editor-title"><div><h2>Result editor</h2><p className="muted">Backend က သတ်မှတ်ထားသော financial columns ပဲဖော်ပြထားသည်။</p>{usedKey && <p className="used-key">နောက်ဆုံးပုံကို Key {usedKey.slot} ({usedKey.masked}) နဲ့ ဖတ်ထုတ်ခဲ့သည်။</p>}</div>{record && <button onClick={() => void save()}>Save result</button>}</div>{record ? <><div className="image-tabs">{record.images.map((image) => <button key={image.id} className="secondary" onClick={() => setActiveRecord(record, image.id)}>{image.name} · {image.status}</button>)}</div><div className="result-grid"><div>{imageUrl && <Image unoptimized className="preview" src={imageUrl} width={800} height={600} alt="Original uploaded ledger" />}</div><textarea value={record.rawText} onChange={(event) => setRecord({ ...record, rawText: event.target.value })} aria-label="Raw extracted text" /></div><div className="table-wrap"><table><thead><tr>{COLUMNS.map((column) => <th key={column}>{column}</th>)}<th /></tr></thead><tbody>{record.rows.map((row) => <tr key={row.id}>{COLUMNS.map((column, index) => <td key={`${row.id}-${column}`}><input value={row.values[index] ?? ""} onChange={(event) => updateCell(row.id, index, event.target.value)} /></td>)}<td><button className="delete" onClick={() => setRows(record.rows.filter((item) => item.id !== row.id))}>×</button></td></tr>)}</tbody></table></div><button className="secondary" onClick={() => setRows([...(record.rows), emptyRow()])}>+ Row ထည့်ပါ</button><div className="totals"><span>စုစုပေါင်းဝင်ငွေ <b>{totals.revenue.toLocaleString()}</b></span><span>စုစုပေါင်းထွက်ငွေ <b>{totals.expense.toLocaleString()}</b></span><span>စုစုပေါင်းအမြတ် <b>{totals.profit.toLocaleString()}</b></span><span>စုစုပေါင်းအရှုံး <b>{totals.loss.toLocaleString()}</b></span><span>Net result <b>{(totals.profit - totals.loss).toLocaleString()}</b></span></div></> : <div className="empty">ပုံတင်ပြီး ဖတ်ထုတ်လျှင် result ကို ဒီမှာပြမယ်။</div>}</section></div>
  </div>;
}
