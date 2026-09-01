"use client";

import Image from "next/image";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { getBrowserKeys, getLedger, listLedgers, removeLedger, saveBrowserKeys, saveLedger, type BrowserApiKey, type LedgerRow, type SavedLedger, type StoredImage } from "../lib/storage";

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
  const [galleryUrls, setGalleryUrls] = useState<Record<string, string>>({});
  const galleryUrlsRef = useRef<string[]>([]);
  const [status, setStatus] = useState("");
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [batchErrors, setBatchErrors] = useState<string[]>([]);
  const [environmentKeys, setEnvironmentKeys] = useState<KeyInfo[]>([]);
  const [browserKeyResults, setBrowserKeyResults] = useState<KeyInfo[]>([]);
  const [testingKeys, setTestingKeys] = useState(false);
  const [showKeyIds, setShowKeyIds] = useState(false);
  const [keyStatus, setKeyStatus] = useState("");
  const [browserKeys, setBrowserKeys] = useState<BrowserApiKey[]>([]);
  const [visibleBrowserKeys, setVisibleBrowserKeys] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<SavedLedger | null>(null);
  const browserKeyDialogRef = useRef<HTMLDialogElement>(null);

  const refresh = async () => setSaved((await listLedgers()).map(normalizeLedger).reverse());
  useEffect(() => {
    void listLedgers().then((items) => setSaved(items.map(normalizeLedger).reverse()));
    void getBrowserKeys().then(setBrowserKeys);
    void fetch("/api/keys/status").then((response) => response.ok ? response.json() : { keys: [] }).then((data: { keys?: KeyInfo[] }) => setEnvironmentKeys(data.keys ?? [])).catch(() => setEnvironmentKeys([]));
  }, []);
  function setActiveRecord(next: SavedLedger | null, imageId?: string) {
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    galleryUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    const nextGalleryUrls = Object.fromEntries((next?.images ?? []).map((item) => [item.id, URL.createObjectURL(item.blob)]));
    galleryUrlsRef.current = Object.values(nextGalleryUrls);
    const image = next?.images.find((item) => item.id === imageId) ?? next?.images[0];
    const url = image ? nextGalleryUrls[image.id] : "";
    imageUrlRef.current = url; setImageUrl(url); setGalleryUrls(nextGalleryUrls); setRecord(next);
  }
  const totals = useMemo(() => (record?.rows ?? []).reduce((acc, row) => ({ revenue: acc.revenue + numberFrom(row.values[1]), expense: acc.expense + numberFrom(row.values[2]), profit: acc.profit + numberFrom(row.values[3]), loss: acc.loss + numberFrom(row.values[4]) }), { revenue: 0, expense: 0, profit: 0, loss: 0 }), [record]);
  const netAmount = totals.revenue - totals.expense;
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
    setStatus(""); setBatchErrors([]); setRecord(null);
    const images: StoredImage[] = []; const rows: LedgerRow[] = []; const rawText: string[] = []; const errors: string[] = [];
    for (const [index, file] of files.entries()) {
      const imageId = crypto.randomUUID(); setBatchProgress({ current: index + 1, total: files.length, name: file.name });
      try {
        const body = new FormData(); body.append("image", file); body.append("browserKeys", JSON.stringify(browserKeys.map((key) => key.value.trim()).filter(Boolean)));
        const response = await fetch("/api/extract", { method: "POST", body });
        const payload = await response.json() as { error?: string; rawText?: string; rows?: string[][]; usedKey?: UsedKey };
        if (!response.ok) throw new Error(payload.error ?? "Extraction failed.");
        images.push({ id: imageId, blob: file, name: file.name, type: file.type, status: "success", usedKey: payload.usedKey });
        rows.push(...(payload.rows ?? []).map((values) => ({ id: crypto.randomUUID(), sourceImageId: imageId, values: Array.from({ length: COLUMNS.length }, (_, cellIndex) => values[cellIndex] ?? "") })));
        rawText.push(`--- ${file.name} ---\n${payload.rawText ?? ""}`);
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
  async function deleteItem(id: string) { await removeLedger(id); if (record?.id === id) setActiveRecord(null); await refresh(); setDeleteTarget(null); setStatus("Result ကိုဖျက်ပြီးပါပြီ။"); }
  const updateCell = (id: string, index: number, value: string) => setRecord((current) => current ? {
    ...current,
    rows: current.rows.map((row) => row.id === id ? { ...row, values: row.values.map((cell, cellIndex) => cellIndex === index ? value : cell) } : row),
  } : current);
  async function testEnvironmentKeys() { setTestingKeys(true); setKeyStatus(""); try { const response = await fetch("/api/keys/status", { method: "POST" }); const data = await response.json() as { keys?: KeyInfo[]; error?: string }; if (!response.ok) throw new Error(data.error ?? "Key test failed."); setEnvironmentKeys(data.keys ?? []); setKeyStatus("Vercel keys စစ်ပြီးပါပြီ။"); } catch (error) { setKeyStatus(error instanceof Error ? error.message : "Key test failed."); } finally { setTestingKeys(false); } }
  async function testBrowserKeys() { setTestingKeys(true); setKeyStatus(""); try { const response = await fetch("/api/keys/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ browserKeys: browserKeys.map((key) => key.value.trim()).filter(Boolean) }) }); const data = await response.json() as { keys?: KeyInfo[]; error?: string }; if (!response.ok) throw new Error(data.error ?? "Key test failed."); setBrowserKeyResults(data.keys ?? []); setKeyStatus("Browser keys စစ်ပြီးပါပြီ။"); } catch (error) { setKeyStatus(error instanceof Error ? error.message : "Key test failed."); } finally { setTestingKeys(false); } }
  async function persistBrowserKeys() { const cleaned = browserKeys.filter((key) => key.value.trim()).map((key) => ({ ...key, label: key.label.trim() || "Browser key", value: key.value.trim() })); await saveBrowserKeys(cleaned); setBrowserKeys(cleaned); setKeyStatus("Browser API keys သိမ်းပြီးပါပြီ။"); }
  const updateBrowserKey = (id: string, field: "label" | "value", value: string) => setBrowserKeys((items) => items.map((item) => item.id === id ? { ...item, [field]: value } : item));
  const keyLabel: Record<KeyState, string> = { working: "Working", rate_limited: "Rate limited", invalid: "Invalid", unavailable: "Not tested" };

  return <div className="shell">
    <header className="hero"><div><p className="eyebrow">LEDGER WORKSPACE</p><h1>Ledger Data Management</h1><p>ပုံ 5 ပုံအထိတင်ပြီး data ကို စစ်ဆေး၊ ပြင်ဆင်၊ သိမ်းနိုင်သည်။</p></div><button className="api-settings-trigger" type="button" onClick={() => browserKeyDialogRef.current?.showModal()}>API settings</button></header>
    <dialog className="key-dialog" ref={browserKeyDialogRef}><div className="key-dialog-content"><div className="dialog-heading"><div><p className="eyebrow">SETTINGS</p><h2>API keys</h2><p className="muted">{environmentKeys.length} Vercel · {browserKeys.length} browser</p></div><button className="delete" type="button" aria-label="Close API settings" onClick={() => browserKeyDialogRef.current?.close()}>×</button></div><section className="api-settings-section"><div className="settings-section-title"><div><h3>Vercel keys</h3><p className="muted">{environmentKeys.length} configured</p></div><div className="key-actions"><button className="secondary" type="button" onClick={() => setShowKeyIds(!showKeyIds)}>{showKeyIds ? "Hide IDs" : "Show IDs"}</button><button type="button" onClick={() => void testEnvironmentKeys()} disabled={testingKeys || !environmentKeys.length}>{testingKeys ? "Testing…" : "Test keys"}</button></div></div><div className="key-list">{environmentKeys.length ? environmentKeys.map((key) => <div className="key-row" key={key.slot}><label>Key {key.slot}</label><output>{showKeyIds ? key.masked : "••••••••••••"}</output><span className={`key-state ${key.state}`}>{keyLabel[key.state]}</span></div>) : <p className="muted">No environment keys found.</p>}</div></section><section className="api-settings-section"><div className="settings-section-title"><div><h3>Browser keys</h3><p className="muted">Stored on this device</p></div></div>{browserKeys.length ? browserKeys.map((key, index) => <div className="browser-key-row" key={key.id}><input aria-label={`Key ${index + 1} label`} value={key.label} placeholder={`Key ${index + 1}`} onChange={(event) => updateBrowserKey(key.id, "label", event.target.value)} /><input aria-label={`Key ${index + 1} value`} type={visibleBrowserKeys.includes(key.id) ? "text" : "password"} value={key.value} placeholder="Paste Gemini API key" onChange={(event) => updateBrowserKey(key.id, "value", event.target.value)} /><button className="secondary" type="button" onClick={() => setVisibleBrowserKeys((items) => items.includes(key.id) ? items.filter((id) => id !== key.id) : [...items, key.id])}>{visibleBrowserKeys.includes(key.id) ? "Hide" : "Show"}</button><button className="delete" type="button" aria-label={`Remove ${key.label || `Key ${index + 1}`}`} onClick={() => setBrowserKeys((items) => items.filter((item) => item.id !== key.id))}>×</button></div>) : <p className="muted">No browser keys yet.</p>}<div className="browser-key-actions"><button className="secondary" type="button" onClick={() => setBrowserKeys((items) => items.length >= 10 ? items : [...items, { id: crypto.randomUUID(), label: `Browser Key ${items.length + 1}`, value: "" }])}>+ Add key</button><button type="button" onClick={() => void persistBrowserKeys()}>Save browser keys</button><button type="button" onClick={() => void testBrowserKeys()} disabled={testingKeys || !browserKeys.some((key) => key.value.trim())}>{testingKeys ? "Testing…" : "Test browser keys"}</button></div>{browserKeyResults.length > 0 && <div className="browser-key-results">{browserKeyResults.map((key, index) => <div className="key-row" key={key.slot}><label>{browserKeys.filter((item) => item.value.trim())[index]?.label || `Browser Key ${key.slot}`}</label><output>{showKeyIds ? key.masked : "••••••••••••"}</output><span className={`key-state ${key.state}`}>{keyLabel[key.state]}</span></div>)}</div>}</section>{keyStatus && <p className="status" role="status">{keyStatus}</p>}</div></dialog>
    <section className="upload card"><label className="file"><input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={chooseFiles} />ပုံရွေးပါ</label><span>{files.length ? `${files.length} / 5 ပုံရွေးထားသည်` : "JPG, PNG, WEBP · ပုံ 5 ပုံအထိ · တစ်ပုံ 4 MB"}</span><button onClick={() => void extractBatch()} disabled={!files.length || !!batchProgress}>{batchProgress ? `${batchProgress.current}/${batchProgress.total} Data Clean လုပ်နေသည်…` : "Data Clean"}</button>{files.length > 0 && <div className="file-list">{files.map((file, index) => <span key={`${file.name}-${index}`}>{file.name}<button className="delete" aria-label={`Remove ${file.name}`} disabled={!!batchProgress} onClick={() => setFiles(files.filter((_, itemIndex) => itemIndex !== index))}>×</button></span>)}</div>}{batchProgress && <p className="status" role="status" aria-live="polite">{batchProgress.name} ကို Data Clean လုပ်နေသည်…</p>}{status && <p className="status" role="status">{status}</p>}{batchErrors.length > 0 && <ul className="batch-errors" role="alert">{batchErrors.map((error) => <li key={error}>{error}</li>)}</ul>}</section>
    {deleteTarget && <div className="modal-backdrop" role="presentation" onMouseDown={() => setDeleteTarget(null)}><section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title" onMouseDown={(event) => event.stopPropagation()}><p className="eyebrow">DELETE SAVED RESULT</p><h2 id="delete-modal-title">ဒီ result ကိုဖျက်မလား?</h2><p className="muted">{deleteTarget.images.length} ပုံနှင့် {deleteTarget.rows.length} rows ကို browser မှ ဖျက်သွားမည်။ ပြန်မရနိုင်ပါ။</p><div className="modal-actions"><button className="secondary" type="button" onClick={() => setDeleteTarget(null)}>Cancel</button><button className="danger-button" type="button" onClick={() => void deleteItem(deleteTarget.id)}>ဖျက်မည်</button></div></section></div>}
    <div className="workspace"><aside className="card saved"><h2>Saved results</h2>{saved.length ? saved.map((item) => <div className="saved-item" key={item.id}><button className="text-btn" onClick={() => void open(item.id)}>{item.images.length} image(s) · {readableDate(item.updatedAt)}<small>{item.rows.length} rows</small></button><button aria-label="Delete result" className="delete" onClick={() => setDeleteTarget(item)}>×</button></div>) : <p className="muted">No saved results.</p>}</aside>
      <section className="card editor"><div className="editor-title"><div><h2>Result editor</h2><p className="muted">စစ်ဆေးပြီး လိုအပ်သလို ပြင်ဆင်ပါ။</p></div>{record && <button onClick={() => void save()}>Save result</button>}</div>{record ? <><div className="image-gallery">{record.images.map((image) => <button key={image.id} className={`image-card ${image.status}`} onClick={() => setActiveRecord(record, image.id)}><Image unoptimized src={galleryUrls[image.id]} width={240} height={160} alt={image.name} /><span>{image.name}</span><small>{image.status === "success" && image.usedKey ? `Key ${image.usedKey.slot} (${image.usedKey.masked})` : image.error ?? "Failed"}</small></button>)}</div><div className="result-grid"><div>{imageUrl && <Image unoptimized className="preview" src={imageUrl} width={800} height={600} alt="Original uploaded ledger" />}</div><textarea value={record.rawText} onChange={(event) => setRecord({ ...record, rawText: event.target.value })} aria-label="Raw extracted text" /></div><div className="table-wrap"><table><thead><tr>{COLUMNS.map((column) => <th key={column}>{column}</th>)}<th /></tr></thead><tbody>{record.rows.map((row) => <tr key={row.id}>{COLUMNS.map((column, index) => <td key={`${row.id}-${column}`}><input value={row.values[index] ?? ""} onChange={(event) => updateCell(row.id, index, event.target.value)} /></td>)}<td><button className="delete" onClick={() => setRows(record.rows.filter((item) => item.id !== row.id))}>×</button></td></tr>)}</tbody></table></div><button className="secondary" onClick={() => setRows([...(record.rows), emptyRow()])}>+ Row ထည့်ပါ</button><section className="summary" aria-label="Ledger summary"><div className={`net-card ${netAmount >= 0 ? "positive" : "negative"}`}><span>{netAmount >= 0 ? "အသားတင်အမြတ်" : "အသားတင်အရှုံး"}</span><b>{Math.abs(netAmount).toLocaleString()}</b><small>{netAmount >= 0 ? "Revenue − Expense" : "Expense − Revenue"}</small></div><div className="totals"><span>စုစုပေါင်းဝင်ငွေ <b>{totals.revenue.toLocaleString()}</b></span><span>စုစုပေါင်းထွက်ငွေ <b>{totals.expense.toLocaleString()}</b></span><span>စုစုပေါင်းအမြတ် <b>{totals.profit.toLocaleString()}</b></span><span>စုစုပေါင်းအရှုံး <b>{totals.loss.toLocaleString()}</b></span></div></section></> : <div className="empty">ပုံတင်ပြီး Data Clean လုပ်ပါ။</div>}</section></div>
  </div>;
}
