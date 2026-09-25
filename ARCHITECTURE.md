# ARCHITECTURE — Ledger Telegram Bot + Dashboard

## 1. System overview

```
Staff Telegram ──photo/caption──▶ Vercel POST /api/telegram/webhook
      │ verify x-telegram-bot-api-secret-token, checkAuthorization, 200 fast
      │ heavy work in after(): download → sharp → staging-thumb-upload ∥ Gemini → move thumb → Prisma
      ▼
Supabase Postgres (Prisma 7) + Storage (thumbnails-only: reports/&lt;date&gt;/&lt;type&gt;-&lt;msgId&gt;.thumb.jpg)
      │
Owner web (Next.js 16 App Router, Better Auth) ──▶ dashboard + approvals queue
```

Single Vercel project + single Supabase project. Web upload removed; web is dashboard-only. Telegram is the only ingress.

## 2. Request flows

### 2.1 Link / OTP (BAI verbatim)
`/link <email>` → lookup pre-registered `TelegramSender` → generate 6-digit OTP (`otpCode`, `otpExpiresAt` ~10 min) → `sendOTPEmail` (Brevo) → sender replies OTP → match + unexpired → set `isVerified/isAuthorized=true`, inherit `allowedLedgers/isDataApprover`, clear `otpCode`. Wrong/expired → reject message, stay unlinked (`KEYBOARD_UNLINKED`).

### 2.2 Submit → extract → approve
1. Photo arrives → `getFileInfoFromMessage` (largest photo) → `checkAuthorization(sender)` → deny + stop if fail (no Gemini call).
2. Mode check: `allowedLedgers.includes(activeReportType)` else `sendNoPermissionPrompt`.
3. Immediate ack message; `after()` continues: `downloadTelegramFile` → size check → sharp (1920px longest, JPEG q75 — Gemini payload, in-memory only; 400px/q60 thumb) → staging thumb upload ∥ `lib/extract/<type>` (Gemini primary with 45 s/key timeout, heuristic fallback) → move thumb to date folder → `DailyReport` upsert for the **content date** (extracted from the photo header, e.g. 21/9/2026; upload date only as fallback — running fuel/brick pages merge into that date) + lines + `SourceImage` (`storagePath` null, thumb only) + `TelegramMessage(chatId,messageId,unique)`. Multiple photos/day merge into one report; `date @unique` is the merge key, not a 1-photo limit.
4. Approver routing: `getIndependentDataApprovers` (same tenant `userId`, `isAuthorized+isVerified+isDataApprover`, exclude submitter) → preview + `[✅ Confirm][❌ Reject]` inline buttons. Owner self-upload skips to CONFIRMED.
5. On action: `notifyOtherApprovers` (no double-handle), notify submitter. Dashboard approvals page mirrors the same queue. `TelegramMessage @unique([senderId, telegramMsgId])` guards duplicate delivery.

### 2.3 Dashboard read/edit
Browser → Supabase (anon key + RLS owner-only) or Next API with session → TanStack Query hooks. Edit line → API recalculates denormalized `DailyReport` totals → charts refresh. No IndexedDB (legacy `lib/storage.ts` removed).

## 3. Prisma schema (Postgres, Prisma 7 + `@prisma/adapter-pg`)

```prisma
enum LedgerType { REVENUE EXPENSE MAINTENANCE FUEL BRICK }
enum RevenueMethod { CASH KBZ_PAY MMQR KBZ_SPECIAL AYA_SPECIAL }
enum ExpenseCategory { BUSINESS_DRAWING PERSONAL_DRAWING OPERATION WAGES }
enum ReportStatus { PENDING CONFIRMED NEEDS_REVIEW }

model DailyReport {
  id String @id @default(cuid())
  date DateTime @unique @db.Date
  status ReportStatus @default(PENDING)
  totalRevenue BigInt @default(0)
  totalExpense BigInt @default(0)
  totalFuelIn Decimal? @db.Decimal(10,2)
  totalFuelOut Decimal? @db.Decimal(10,2)
  revenueLines RevenueLine[]  expenseLines ExpenseLine[]
  maintenanceLines MaintenanceLine[]  fuelEntries FuelEntry[]
  brickEntries BrickEntry[]  images SourceImage[]
  telegramMessages TelegramMessage[]
  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt
}
model RevenueLine { id String @id @default(cuid())  reportId String
  report DailyReport @relation(fields:[reportId], references:[id], onDelete:Cascade)
  method RevenueMethod  amount BigInt  @@unique([reportId, method]) }
model ExpenseLine { id String @id @default(cuid())  reportId String
  report DailyReport @relation(fields:[reportId], references:[id], onDelete:Cascade)
  category ExpenseCategory  name String?  role String?  amount BigInt
  @@index([reportId, category]) }
model MaintenanceLine { id String @id @default(cuid())  reportId String
  report DailyReport @relation(fields:[reportId], references:[id], onDelete:Cascade)
  vehicle String  amount BigInt  part String?  (no vendor — book has 3 cols)
  @@index([reportId]) }
model FuelEntry { id String @id @default(cuid())  reportId String
  report DailyReport @relation(fields:[reportId], references:[id], onDelete:Cascade)
  vehicle String  (legacy, always "" — machine names live in particular)
  particular String?  inGal Decimal? @db.Decimal(10,2)
  outGal Decimal? @db.Decimal(10,2)  balanceGal Decimal? @db.Decimal(10,2)
  balanceOk Boolean?  confidence Float?  @@index([reportId, vehicle]) }
model BrickEntry { id String @id @default(cuid())  reportId String
  report DailyReport @relation(fields:[reportId], references:[id], onDelete:Cascade)
  item String  qty Decimal? @db.Decimal(12,2)  unitPrice BigInt?  amount BigInt?
  confidence Float?  @@index([reportId]) }
model SourceImage { id String @id @default(cuid())  reportId String
  report DailyReport @relation(fields:[reportId], references:[id], onDelete:Cascade)
  ledgerType LedgerType  storagePath String  thumbnailPath String?
  telegramFileId String?  sizeBytes Int?  rawText String? @db.Text
  createdAt DateTime @default(now())  @@index([reportId, ledgerType]) }
model TelegramMessage { id String @id @default(cuid())
  reportId String?  report DailyReport? @relation(fields:[reportId], references:[id], onDelete:SetNull)
  chatId String  messageId Int  ledgerType LedgerType?  status String  error String?
  createdAt DateTime @default(now())  @@unique([chatId, messageId])  @@index([chatId]) }
```

Plus BAI-copied: `User/Session/Account/Verification` (Better Auth), `TelegramSender` (telegramUserId BigInt, email, otpCode/otpExpiresAt, isVerified, isAuthorized, isDataApprover, `allowedLedgers String[]`, activeReportType, userId tenant FK). No `Shop` table (single client; add with RLS only for client #2). Money = kyat integer BigInt (serialize via `.toString()`); RLS owner-only; Prisma server code uses service role.

## 4. Auth & route guard
- Better Auth email/password; first admin via `/setup` (locks permanently after first user, API 403); `/admin/users` role promote.
- `proxy.ts` (Next 16, not middleware): session-cookie check; PUBLIC = `/login /admin/login /api/auth /setup /api/setup /api/telegram/*`; everything else redirects to login.
- `/api/senders` (admin): list + toggle `isAuthorized / allowedLedgers / isDataApprover`.

## 5. Extraction library (`lib/extract/`)
- `shared.ts`: Gemini client, sequential key rotation over `GEMINI_API_KEYS` (retry only quota/rate-limit/key errors; terminal format errors return directly), `maskKey` (`••••last4`), Myanmar-digit normalize, amount parsing, `temperature: 0` + `responseMimeType: application/json`.
- Per type (`revenue|expense|maintenance|fuel|brick.ts`): `parseXMessage` (regex heuristic, sync, never throws) + `parseXMessageWithGemini` + fixed JSON schema + confidence/unreadable_fields. Caption = type hint. `isFileTooLarge` gate before Gemini.
- Current `app/api/extract/route.ts` logic moves here; the route becomes a thin wrapper (or is removed once dashboard edits go through `/api/reports`).

## 6. Telegram library (`src/lib/telegram/`, BAI reuse)
- `client.ts` verbatim: send/edit/copy/document/answerCallback/download/getFileInfo.
- `templates.ts` rewritten for ledgers: per-mode format prompt + copy-paste template + menu builder + bilingual copy + `escapeHtml`.
- `senders.ts` adapted: upsert, activeReportType state machine, OTP helpers.

## 7. Dashboard
- Routes: `/dashboard` overview, `/fuel`, `/brick`, `/reports/[date]`, `/approvals`, `/settings`, `/admin/users`, `/login`, `/admin/login`, `/setup`.
- Date filter (BAI semantics, URL-only): `lib/date-filter.ts` + `components/DateFilter.tsx` in the header-right `actions` slot; default current month; modes overall/day/month/year/custom.
- Range delete: `DELETE /api/ledger-entries` (fuel|brick, owner-only) + reusable `components/Modal.tsx` confirm.
- Dashboard approve/reject (`POST /api/approvals`) notifies the submitter's Telegram chat.
- Charts: custom SVG (line + donut + bar) copied from BAI `monthly-demand-chart.tsx`. No IndexedDB (legacy `lib/storage.ts` removed).

## 8. Env & secrets
Server-only: `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `GEMINI_API_KEYS`, `BETTER_AUTH_SECRET`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`. Public (`NEXT_PUBLIC_`): app URL/name only. Never a key. Bot config DB-first (`BotSettings` with env fallback); Settings PUT auto-registers the webhook.

## 9. Error taxonomy & limits
Retryable (next key): 429/quota/rate-limit/invalid-key/permission-denied. Terminal (direct 4xx/5xx, no key burn): bad image type/size, malformed Gemini JSON after 1 parse attempt → `NEEDS_REVIEW` with rawText. Webhook must answer 200 < Telegram retry window; Gemini sequential, 1 photo = 1 call (~5–15 s, inside 60 s Hobby cap). `date @unique` merges 4–6 photos/day into 1 report/day (bot accepts multiple photos; no per-day photo cap at 1).

## 10. BAI reuse map
| Copy verbatim | Adapt (rename/reshape) | Skip |
|---|---|---|
| `telegram/client.ts`, `text-normalize.ts`, SVG chart, `/setup` lock, `proxy.ts` shape, `senders` API shape | `templates.ts` prompts, `demand-parser.ts` → `ledger-parser` per-type, `TelegramSender.allowedDepartments` → `allowedLedgers`, finance tables → ledger tables | Customer/Demand/HR/projects-infra, xlsx bulk import, QA/QADocument, multi-role RBAC beyond admin/user |
