CREATE TABLE IF NOT EXISTS "pending_upload" (
  "id" TEXT PRIMARY KEY,
  "report_id" TEXT NOT NULL REFERENCES "daily_report"("id") ON DELETE CASCADE,
  "mode" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "pending_upload_report_id_status_idx" ON "pending_upload"("report_id", "status");
