import { openDB, type DBSchema } from "idb";

export type LedgerRow = { id: string; values: string[]; sourceImageId?: string };
export type StoredImage = { id: string; blob: Blob; name: string; type: string; status: "success" | "failed"; error?: string };
export type SavedLedger = {
  id: string; images: StoredImage[]; rawText: string;
  columns: string[]; rows: LedgerRow[]; createdAt: string; updatedAt: string;
};

interface LedgerDB extends DBSchema { ledgers: { key: string; value: SavedLedger; indexes: { "by-updated": string } } }

const db = () => openDB<LedgerDB>("myanmar-ledger-ocr", 1, {
  upgrade(database) {
    const store = database.createObjectStore("ledgers", { keyPath: "id" });
    store.createIndex("by-updated", "updatedAt");
  },
});

export async function listLedgers() { return (await db()).getAllFromIndex("ledgers", "by-updated"); }
export async function getLedger(id: string) { return (await db()).get("ledgers", id); }
export async function saveLedger(record: SavedLedger) { await (await db()).put("ledgers", record); }
export async function removeLedger(id: string) { await (await db()).delete("ledgers", id); }
