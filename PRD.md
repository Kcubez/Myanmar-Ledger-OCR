# PRD — Ledger Telegram Bot + Dashboard

## 1. Problem
Client runs a single business (fuel, brick/materials, sand operations) on handwritten paper ledgers. Paper is slow to reconcile, payment splits (Cash / KBZ Pay / MMQR / KBZ Special / AYA Special) are error-prone, and there is no dashboard with charts. Goal: staff photograph ledgers via Telegram, owner reviews/approves and sees a clean web dashboard with charts.

## 2. Users & roles
| Role | Who | Capabilities |
|---|---|---|
| Owner-admin | 1 person (client) | Full dashboard, approve/reject all, manage staff scopes, edit any report, rotate keys via env |
| Staff sender | Linked staff only | Submit photos for `allowedLedgers` subset only |
| Approver | Owner only | Confirm/reject PENDING queue on the dashboard |

No anonymous/public access. No self-signup. Owner creates staff pre-registrations (email + scopes); staff self-links via Telegram + email OTP.

## 3. Scope (Day 1 = all 5 ledger types)
| Ledger | Input photo | Extracted fields | Validation |
|---|---|---|---|
| Revenue | Daily revenue summary table | `date, total, cash, kbz_pay, mmqr, kbz_special, aya_special` | `sum(parts) == total`, else flag |
| Expense (OPEX) | Expense + daily wages tables | `total, business_drawing, personal_drawing, operation, wages[{name,amount}]` (name merged, e.g. "6E-4110 Driver") | `sum == total`, else flag |
| Maintenance | Maintenance table (Vehicle/Ship \| Amount \| Part — 3 cols, no vendor) | `[{vehicle, amount, part}]` | amount > 0 |
| Fuel | Fuel ledger (Date\|Particular\|In\|Out\|Balance, gallons — particular holds machine/notes, no vehicle col) | `[{date, particular, in_gal, out_gal, balance_gal}]` | running-balance check → `balanceOk` |
| Brick | Brick ledger (Myanmar handwriting) | `[{item, qty, unit_price, amount}]` + `rawText` always | low-confidence flagged, **never invent values** |

Common per extraction: `{confidence 0–1, unreadable_fields[]}`. Unclear values → empty + flag → dashboard edit, never hallucinated.

## 4. Bot UX (bilingual EN + Myanmar)
1. Unknown sender sees `/link` keyboard only.
2. `/link <company-email>` → 6-digit OTP via Brevo → sender types OTP → `isVerified + isAuthorized`, inherits pre-registered `allowedLedgers`.
3. Linked sender: `/menu` → ledger-type buttons (only allowed) → mode set (`activeReportType`) → format prompt + copy-paste template shown.
4. Photo (+ optional caption) → immediate ack ("လက်ခံရရှိပါပြီ, စစ်ဆေးနေသည်…") → extraction in background → parsed summary + low-confidence highlights + `[✅ Confirm] [🔁 Retake]`.
5. Unauthorized user/mode → deny message + stop (no quota burn).
6. Owner self-upload → auto-confirm (no self-approval round-trip).

## 5. Dashboard (web upload REMOVED, Telegram-only input)
- Login: email/password (Better Auth), single admin; session-guarded routes.
- Pages: Overview (revenue vs expense line, payment-split donut, OPEX bar; CONFIRMED-only, line-zero days hidden), Fuel (in/out per particular bar, per-row edit/delete), Brick (qty/amount by item, per-row edit/delete), Maintenance (spend per vehicle/ship bar, per-row edit/delete), Revenue (daily payment-split table, per-day + range delete, quick-edit modal), Expense (daily OPEX table incl. wages, per-day + range delete, quick-edit modal), Approvals queue (inline full editor per pending report + approve/reject; source photos live in Telegram, not displayed).
- Charts: MUI X Charts Community (MIT) — TrendChart/LineChart, DonutChart/PieChart, BarChart via `components/charts.tsx`; Inter numerals + leaf brand theme (`lib/mui-theme.ts`).
- Edit behavior: editing revenue/expense lines recalculates derived totals immediately (fixes legacy 5-column staleness bug).

## 6. Non-goals
No web upload, no multi-client/SaaS billing, no xlsx bulk import, no QA chatbot, no inventory stock engine beyond fuel balance check, no PDF/multi-page flow.

## 7. Constraints (free tier, client-sale)
- Supabase Free: 500 MB DB, 1 GB Storage, 5 GB egress/mo, 7-day inactivity pause, no backups. Vercel Hobby: 60 s function cap, 100 GB bandwidth, **non-commercial only → client production needs Pro**.
- Storage math (thumbnails-only policy): 4–6 photos/day × ~7 KB (400px/q60 thumb; 1920px main lives in memory as Gemini payload then discarded) ≈ 15 MB/yr → 1 GB quota ≈ 60+ yr. DB rows kept; legacy full-size rows remain as fallback.
- Telegram `file_id` is short-lived (redownload window only), not archival. Supabase Storage is source of truth.
- Money stored as kyat integer (`BigInt`); gallons `Decimal(10,2)`; Myanmar digits normalized before parse.

## 8. Acceptance criteria
- [ ] Unlinked/unauthorized sender cannot trigger Gemini (no quota burn, deny message shown).
- [ ] OTP link works end-to-end; expired/wrong OTP rejected with message.
- [ ] Each ledger type extracts to schema with `sum==total` / balance checks flagging mismatches, never inventing.
- [ ] Staff submit → approver gets preview + Confirm/Reject; double-handle notifies other approvers; submitter notified.
- [ ] Dashboard shows payment-split donut + revenue/expense trend + fuel/brick views from real data; owner edit recalculates totals.
- [ ] 1 report/day (4–6 photos merge into the same date's report) enforced at DB (`date @unique`); bot accepts multiple photos per day.
- [ ] `reportDate` comes from the photo's content date (e.g. 21/9/2026 header), NOT the upload date; running-log pages (fuel/brick) merge into that date's report, upload date used only as fallback.
- [ ] No full API keys leak to browser (masked `••••last4` only); webhook secret verified.
- [ ] Image pipeline stores 400px/q60 thumb only; 1920px main + original Telegram file discarded.

## 9. Open items (locked unless stated)
- Prisma 7 + `@prisma/adapter-pg` baseline (BAI stack). Brevo sender email required for OTP. Singapore region recommended.


## 2026-09-29 — Approved upload and image retention changes
- Images are transient: Telegram download → in-memory resize → Gemini → discard. Do not upload originals or thumbnails to Storage. Review original photos in Telegram; dashboard previews are removed.
- PendingUpload stores extracted JSON only. Existing approved lines and report status remain unchanged on upload. Approve atomically applies that upload: revenue/expense/maintenance replace the same type; fuel/brick append deduplicated rows. Reject affects only the pending upload.
- Existing legacy pending reports must be reviewed before approving new uploads for the same date. No automatic restoration or approval of legacy data.
- This section supersedes earlier thumbnail-storage and upload-time replacement policies.

## Inventory daily summaries — 2026-09-30 (supersedes Fuel/Brick input)
Active ledgers: Inventory, Revenue, Expense, Maintenance. Inventory categories:
Sand (sud), Gravel (sud), Cement (bags), Brick (nos), Fuel (gal).
Keep Cement brands and Brick variants as separate particulars. New reference
photos are data-files/inventory.jpg and inventory_fuel.jpg; old running-book
Fuel/Brick photos are retired for new input. Keep historical tables and pages
as legacy records; never reinterpret or delete their data automatically.
Telegram offers one Inventory mode and detects material-summary vs fuel sheet.
Material summaries have one row per product/variant. Fuel retains physical row
order, with each vehicle/supplier movement and running shared-tank balance.
Fuel closing balance is the LAST row's balance, never the sum of balances.
For the sample: out 53 gal, in 108 gal, closing 149 gal. Blank/unclear values
stay null and flagged; explicit dash means no movement. Preserve source text.
Uploads remain pending until approval. Approval replaces ONLY the same day's
sheet kind (materials or fuel) atomically, preserving the other sheet and other
ledgers. Retakes do not add duplicate movements. Older approved replacements
cannot overwrite newer approved versions of the same sheet kind.
Inventory page has date and category filters, source-order detail and units.

## 2026-10-09 — Per-photo date corrections

Each Telegram photo is a durable ledger submission. It has an AI-extracted
effective date that an owner may correct after approval. A correction moves
only that submission's live rows and source metadata to the destination daily
report; it never moves unrelated ledger types submitted for the same day.
`DailyReport.date` remains unique and is the dashboard/chart grouping key, not
the owner of a photo's date. A destination may contain different ledger types,
but a second daily summary of the same type (or inventory sheet kind) is
rejected rather than merged or overwritten. Historical rows that cannot be
linked to a single upload remain explicitly non-movable until reviewed.
Old sender scopes with BOTH fuel and brick migrate to inventory; single legacy
scope requires owner to explicitly grant inventory to avoid broader access.
