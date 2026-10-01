ALTER TYPE "LedgerType" ADD VALUE IF NOT EXISTS 'INVENTORY';
CREATE TABLE IF NOT EXISTS "inventory_entry" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "report_id" TEXT NOT NULL REFERENCES "daily_report"("id") ON DELETE CASCADE,
 "sheet_kind" TEXT NOT NULL CHECK ("sheet_kind" IN ('materials','fuel')),
 "position" INTEGER NOT NULL,
 "category" TEXT NOT NULL CHECK ("category" IN ('sand','gravel','cement','brick','fuel')),
 "particular" TEXT NOT NULL,
 "unit" TEXT NOT NULL,
 "quantity_in" DECIMAL(14,3), "quantity_out" DECIMAL(14,3),
 "balance" DECIMAL(14,3), "balance_ok" BOOLEAN,
 UNIQUE ("report_id","sheet_kind","position")
);
CREATE INDEX IF NOT EXISTS "inventory_entry_category_report_id_idx" ON "inventory_entry"("category","report_id");
-- Only combined legacy permissions imply access to the unified inventory.
UPDATE "telegram_sender" SET "allowed_ledgers" =
 array_append(array_remove(array_remove("allowed_ledgers", 'fuel'), 'brick'), 'inventory')
 WHERE "allowed_ledgers" @> ARRAY['fuel','brick'] AND NOT "allowed_ledgers" @> ARRAY['inventory'];
UPDATE "telegram_sender" SET "activeReportType" = 'none'
 WHERE "activeReportType" IN ('fuel','brick');
ALTER TABLE "inventory_entry" ENABLE ROW LEVEL SECURITY;
