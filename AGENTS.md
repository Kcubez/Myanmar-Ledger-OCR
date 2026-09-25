# AGENTS.md — contributor working agreement

## Scope
Single-client ledger system: Telegram-only input, dashboard-only web. Ledger types are a CLOSED set: `revenue | expense | fuel | brick | maintenance`. Do not add types, roles, or public signup without a PRD update.

## Canonical sources (BAI reuse rule)
- Telegram primitives: copy BAI `lib/telegram/client.ts` semantics (send/edit/download/largest-photo). Do not reinvent the Bot API client.
- Bot copy: bilingual (EN + Myanmar) via `templates.ts`; escape HTML with `escapeHtml`.
- Charts: custom SVG only (BAI `monthly-demand-chart.tsx` pattern). No recharts/d3. No new image libs beyond `sharp`.

## Parser contract (`lib/extract/`)
- Every parser returns `{ data, confidence, unreadable_fields[] }` and NEVER throws, NEVER invents values. Unclear → empty + flag.
- Gemini: `temperature 0`, `responseMimeType application/json`, fixed schema per type, caption as type hint.
- Key rotation: sequential over comma-separated keys (DB `BotSettings.geminiApiKey` first, `GEMINI_API_KEYS` env fallback); 90 s/key timeout + 1 same-key retry, continue only on quota/rate-limit/key/timeout errors; terminal errors return directly without burning keys.
- Money: kyat integers (`BigInt` in Prisma, string over JSON). Gallons: `Decimal`. Normalize Myanmar digits ၀-၉ before parsing.

## Auth & tenant rules
- `proxy.ts` guard + PUBLIC list is load-bearing; keep `/api/telegram/*` public (secret-header auth) and everything else session-gated.
- Every webhook update passes `checkAuthorization` BEFORE any Gemini/file work. Mode switches check `allowedLedgers`.
- Prisma server code uses service role; browser uses anon key + RLS (owner-only). Never expose service key to client.
- `/setup` lock (403 after first user) must keep working — it is the client-handover path.

## Data rules
- `DailyReport.date` is `@unique` (1 report/day; 4–6 photos merge into it — never a 1-photo cap). `reportDate` comes from the photo content date, upload date is fallback only. Totals are denormalized — recalc on confirm AND on dashboard edit.
- `TelegramMessage @@unique([chatId, messageId])` — keep dedupe. `telegram file_id` is transient; Storage paths are truth.
- Images: thumbnails-only policy (cost) — 400px/q60 thumb (~7KB) to Storage, 1920px/q75 main lives in memory as Gemini payload then discarded. No originals, no blob-in-DB. `SourceImage.storagePath` null for new rows (legacy rows keep it as fallback).

## Verification gates (run before every PR)
`npm run lint` · `npx tsc --noEmit` · webhook smoke (link→OTP→submit→approve with stubbed Gemini) · extract fixtures per ledger type (including sum/balance mismatch cases) · `npx prisma validate`.

## Commits
Conventional commits (`feat/fix/refactor/docs:`). One logical change per commit. Never commit `.env`, Storage files, or generated Prisma client output.
