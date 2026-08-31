import { openDB, type DBSchema } from "idb";

export type LedgerRow = { id: string; values: string[] };
export type SavedLedger = {
  id: string; image: Blob; imageName: string; imageType: string; rawText: string;
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
