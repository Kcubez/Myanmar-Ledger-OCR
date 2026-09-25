# ARCHITECTURE ESSENTIALS (one-page runtime cheat sheet)

## Flow (10 lines)
1. Telegram photo → `POST /api/telegram/webhook` (secret header + auth gate, 200 fast, work in `after()`).
2. Largest photo → sharp 1920px/q75 (Gemini payload, in-memory only) + 400px/q60 thumb → Supabase Storage (thumbnails-only); original discarded.
3. `lib/extract/<type>` — Gemini first, heuristic fallback, never throws, never invents.
4. Upsert `DailyReport` for the content date (photo header, not upload date) + lines + `SourceImage` + `TelegramMessage(chatId,messageId)`. 4–6 photos/day merge into 1 report.
5. Approvers preview + Confirm/Reject; others notified; submitter notified.
6. Dashboard reads Supabase; edits recalc denormalized totals.

## Env
| Server-only | Public |
|---|---|
| `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `GEMINI_API_KEYS`, `BETTER_AUTH_SECRET`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_NAME` only |

## Contracts
- Webhook: must return 200 quickly; verify `x-telegram-bot-api-secret-token`; 1 photo = 1 Gemini call (~5–15 s).
- DB invariants: `DailyReport.date @unique` (1 report/day; 4–6 photos merge into it); totals denormalized, recalc on confirm/edit; money `BigInt` (serialize!), gallons `Decimal`; `TelegramMessage @@unique([chatId, messageId])`.
- Auth gates: unlinked → `/link` only; wrong mode → deny, no Gemini call; PUBLIC paths: `/login /admin/login /api/auth /setup /api/setup /api/telegram/*`.
- Keys: browser gets masked `••••last4` only; rotate via env.

## Free-tier limits
Supabase: 500 MB DB · 1 GB Storage · 5 GB egress · 7-day pause · no backups. Vercel Hobby: 60 s fn cap · non-commercial (client prod → Pro). Thumbnails-only (~7 KB/photo) ≈ 15 MB/yr — storage cost ~zero. `telegram file_id` is temporary. Free-plan 50 MB cap is per-file, not total.

## Incident fixes
| Symptom | Fix |
|---|---|
| 429/quota | next key auto-tried; all fail → "try later", check key status page |
| Telegram retries/spam | webhook not returning 200 fast enough — move work to `after()` |
| Wrong OTP/expired | resend `/link`, 10-min window, Brevo sender verified? |
| Balance/sum mismatch | expected — flagged NEEDS_REVIEW, fix in dashboard |
| Supabase paused | manual resume in dashboard; consider Pro for client |
| BigInt serialize crash | `.toString()` amounts at API boundary |

## Don'ts
No `NEXT_PUBLIC_` keys · no blob-in-DB · no multi-photo batch · no web upload (removed) · no invented values · no new chart/image deps without bundle check.
