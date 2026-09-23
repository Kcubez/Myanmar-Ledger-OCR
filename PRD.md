# PRD — Ledger Telegram Bot + Dashboard

## 1. Problem
Client runs a single business (fuel, brick/materials, sand operations) on handwritten paper ledgers. Paper is slow to reconcile, payment splits (Cash / KBZ Pay / MMQR / KBZ Special / AYA Special) are error-prone, and there is no dashboard with charts. Goal: staff photograph ledgers via Telegram, owner reviews/approves and sees a clean web dashboard with charts.

## 2. Users & roles
| Role | Who | Capabilities |
|---|---|---|
| Owner-admin | 1 person (client) | Full dashboard, approve/reject all, manage staff scopes, edit any report, rotate keys via env |
| Staff sender | Linked staff only | Submit photos for `allowedLedgers` subset only |
| Approver | Owner (and optionally 1 delegate) | Confirm/reject PENDING queue (`isDataApprover=true`) |

No anonymous/public access. No self-signup. Owner creates staff pre-registrations (email + scopes); staff self-links via Telegram + email OTP.

## 3. Scope (Day 1 = all 5 ledger types)
| Ledger | Input photo | Extracted fields | Validation |
|---|---|---|---|
| Revenue | Daily revenue summary table | `date, total, cash, kbz_pay, mmqr, kbz_special, aya_special` | `sum(parts) == total`, else flag |
| Expense (OPEX) | Expense + daily wages tables | `total, business_drawing, personal_drawing, operation, wages[{name,role,amount}]` | `sum == total`, else flag |
| Maintenance | Maintenance table | `[{vehicle, amount, part, vendor}]` | amount > 0 |
| Fuel | Fuel ledger (Date\|Particular\|In\|Out\|Balance, gallons) | `[{date, vehicle, in_gal, out_gal, balance_gal}]` | running-balance check → `balanceOk` |
| Brick | Brick ledger (Myanmar handwriting) | `[{item, qty, unit_price, amount}]` + `rawText` always | low-confidence flagged, **never invent values** |

Common per extraction: `{confidence 0–1, unreadable_fields[]}`. Unclear values → empty + flag → dashboard edit, never hallucinated.

## 4. Bot UX (bilingual EN + Myanmar)
1. Unknown sender sees `/link` keyboard only.
2. `/link <company-email>` → 6-digit OTP via Brevo → sender types OTP → `isVerified + isAuthorized`, inherits pre-registered `allowedLedgers`/`isDataApprover`.
3. Linked sender: `/menu` → ledger-type buttons (only allowed) → mode set (`activeReportType`) → format prompt + copy-paste template shown.
4. Photo (+ optional caption) → immediate ack ("လက်ခံရရှိပါပြီ, စစ်ဆေးနေသည်…") → extraction in background → parsed summary + low-confidence highlights + `[✅ Confirm] [🔁 Retake]`.
5. Unauthorized user/mode → deny message + stop (no quota burn).
6. Owner self-upload → auto-confirm (no self-approval round-trip).

## 5. Dashboard (web upload REMOVED, Telegram-only input)
- Login: email/password (Better Auth), single admin; session-guarded routes.
- Pages: Overview (revenue vs expense line, payment-split donut, OPEX bar), Fuel (in/out per vehicle bar + balance line + low-stock alert), Brick (qty/amount by item), Daily detail (original photo + editable parsed tables + totals recalc), Approvals queue (pending/confirmed/rejected).
- Charts: zero-dependency custom SVG (BAI `monthly-demand-chart.tsx` pattern) — no recharts, Vercel-free-friendly bundle.
- Edit behavior: editing revenue/expense lines recalculates derived totals immediately (fixes legacy 5-column staleness bug).

## 6. Non-goals
No web upload, no multi-client/SaaS billing, no xlsx bulk import, no QA chatbot, no inventory stock engine beyond fuel balance check, no PDF/multi-page flow.

## 7. Constraints (free tier, client-sale)
- Supabase Free: 500 MB DB, 1 GB Storage, 5 GB egress/mo, 7-day inactivity pause, no backups. Vercel Hobby: 60 s function cap, 100 GB bandwidth, **non-commercial only → client production needs Pro**.
- Storage math: 4–6 photos/day (2 daily-summary pages + fuel page + brick page + occasional calculation summary) × ~0.6 MB (compressed 1920px + thumb, originals deleted) ≈ 2.5–4 MB/day → 1 GB ≈ 8–13 mo. Retention: 6-month original-purge written into contract; DB rows kept.
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
- [ ] Image pipeline stores compressed + thumb only; original Telegram file discarded.

## 9. Open items (locked unless stated)
- Prisma 7 + `@prisma/adapter-pg` baseline (BAI stack). Brevo sender email required for OTP. Singapore region recommended.
