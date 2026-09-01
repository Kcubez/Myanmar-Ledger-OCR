import { openDB, type DBSchema } from "idb";

export type LedgerRow = { id: string; values: string[]; sourceImageId?: string };
export type StoredImage = { id: string; blob: Blob; name: string; type: string; status: "success" | "failed"; error?: string; usedKey?: { slot: number; masked: string } };
export type BrowserApiKey = { id: string; label: string; value: string };
export type SavedLedger = {
  id: string; images: StoredImage[]; rawText: string;
  columns: string[]; rows: LedgerRow[]; createdAt: string; updatedAt: string;
};

interface LedgerDB extends DBSchema {
  ledgers: { key: string; value: SavedLedger; indexes: { "by-updated": string } };
  settings: { key: string; value: BrowserApiKey[] };
}

const db = () => openDB<LedgerDB>("myanmar-ledger-ocr", 2, {
  upgrade(database) {
    if (!database.objectStoreNames.contains("ledgers")) {
      const store = database.createObjectStore("ledgers", { keyPath: "id" });
      store.createIndex("by-updated", "updatedAt");
    }
    if (!database.objectStoreNames.contains("settings")) database.createObjectStore("settings");
  },
});

export async function listLedgers() { return (await db()).getAllFromIndex("ledgers", "by-updated"); }
export async function getLedger(id: string) { return (await db()).get("ledgers", id); }
export async function saveLedger(record: SavedLedger) { await (await db()).put("ledgers", record); }
export async function removeLedger(id: string) { await (await db()).delete("ledgers", id); }
export async function getBrowserKeys() { return (await (await db()).get("settings", "browser-api-keys")) ?? []; }
export async function saveBrowserKeys(keys: BrowserApiKey[]) { await (await db()).put("settings", keys, "browser-api-keys"); }
