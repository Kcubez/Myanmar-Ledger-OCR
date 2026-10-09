-- A Telegram photo is the durable submission boundary. Its effective date can
-- be corrected without moving unrelated ledger types in the same daily report.
ALTER TABLE "pending_upload" ADD COLUMN "effective_date" DATE;
ALTER TABLE "pending_upload" ADD COLUMN "approved_at" TIMESTAMP(3);

UPDATE "pending_upload" AS u
SET "effective_date" = r."date"
FROM "daily_report" AS r
WHERE r."id" = u."report_id" AND u."effective_date" IS NULL;

ALTER TABLE "pending_upload" ALTER COLUMN "effective_date" SET NOT NULL;

ALTER TABLE "revenue_line" ADD COLUMN "submission_id" TEXT;
ALTER TABLE "expense_line" ADD COLUMN "submission_id" TEXT;
ALTER TABLE "maintenance_line" ADD COLUMN "submission_id" TEXT;
ALTER TABLE "fuel_entry" ADD COLUMN "submission_id" TEXT;
ALTER TABLE "brick_entry" ADD COLUMN "submission_id" TEXT;
ALTER TABLE "inventory_entry" ADD COLUMN "submission_id" TEXT;
ALTER TABLE "source_image" ADD COLUMN "submission_id" TEXT;

-- Existing approved rows predate submission links. They belong to the newest
-- approved upload of their mode on that report; ambiguous historical rows stay
-- null rather than being guessed.
UPDATE "revenue_line" l SET "submission_id" = (
  SELECT u."id" FROM "pending_upload" u WHERE u."report_id" = l."report_id" AND u."mode" = 'revenue' AND u."status" = 'CONFIRMED' ORDER BY u."created_at" DESC LIMIT 1
) WHERE "submission_id" IS NULL;
UPDATE "expense_line" l SET "submission_id" = (
  SELECT u."id" FROM "pending_upload" u WHERE u."report_id" = l."report_id" AND u."mode" = 'expense' AND u."status" = 'CONFIRMED' ORDER BY u."created_at" DESC LIMIT 1
) WHERE "submission_id" IS NULL;
UPDATE "maintenance_line" l SET "submission_id" = (
  SELECT u."id" FROM "pending_upload" u WHERE u."report_id" = l."report_id" AND u."mode" = 'maintenance' AND u."status" = 'CONFIRMED' ORDER BY u."created_at" DESC LIMIT 1
) WHERE "submission_id" IS NULL;
UPDATE "inventory_entry" l SET "submission_id" = (
  SELECT u."id" FROM "pending_upload" u WHERE u."report_id" = l."report_id" AND u."mode" = 'inventory' AND u."status" = 'CONFIRMED' AND u."payload"->>'sheetKind' = l."sheet_kind" ORDER BY u."created_at" DESC LIMIT 1
) WHERE "submission_id" IS NULL;
UPDATE "source_image" s SET "submission_id" = (
  SELECT u."id" FROM "pending_upload" u WHERE u."report_id" = s."report_id" AND u."mode" = lower(s."ledger_type"::text) AND u."status" IN ('DRAFT', 'PENDING', 'CONFIRMED', 'REJECTED') ORDER BY u."created_at" DESC LIMIT 1
) WHERE "submission_id" IS NULL;

ALTER TABLE "revenue_line" ADD CONSTRAINT "revenue_line_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "pending_upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expense_line" ADD CONSTRAINT "expense_line_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "pending_upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "maintenance_line" ADD CONSTRAINT "maintenance_line_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "pending_upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fuel_entry" ADD CONSTRAINT "fuel_entry_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "pending_upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "brick_entry" ADD CONSTRAINT "brick_entry_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "pending_upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_entry" ADD CONSTRAINT "inventory_entry_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "pending_upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "source_image" ADD CONSTRAINT "source_image_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "pending_upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "revenue_line_submission_id_idx" ON "revenue_line"("submission_id");
CREATE INDEX "expense_line_submission_id_idx" ON "expense_line"("submission_id");
CREATE INDEX "maintenance_line_submission_id_idx" ON "maintenance_line"("submission_id");
CREATE INDEX "fuel_entry_submission_id_idx" ON "fuel_entry"("submission_id");
CREATE INDEX "brick_entry_submission_id_idx" ON "brick_entry"("submission_id");
CREATE INDEX "inventory_entry_submission_id_idx" ON "inventory_entry"("submission_id");
CREATE INDEX "source_image_submission_id_idx" ON "source_image"("submission_id");
