# AGENTS.md — contributor working agreement

## Scope
Single-client ledger system: Telegram-only input, dashboard-only web. Ledger types are a CLOSED set: `revenue | expense | inventory | maintenance` (Fuel/Brick remain legacy data only; see 2026-09-30 PRD update). Do not add types, roles, or public signup without a PRD update.

## Canonical sources (BAI reuse rule)
- Telegram primitives: copy BAI `lib/telegram/client.ts` semantics (send/edit/download/largest-photo). Do not reinvent the Bot API client.
- Bot copy: bilingual (EN + Myanmar) via `templates.ts`; escape HTML with `escapeHtml`.
- Charts: MUI X Charts (Community, MIT) via `components/charts.tsx` (TrendChart/DonutChart/BarChart, same props API across pages). MUI theme in `lib/mui-theme.ts` mirrors the flat brand tokens. No recharts/d3. No new image libs beyond `sharp`. No MUI X Pro imports (commercial license — grep gate).

## Parser contract (`lib/extract/`)
- Every parser returns `{ data, confidence, unreadable_fields[] }` and NEVER throws, NEVER invents values. Unclear → empty + flag.
- Gemini: `temperature 0`, `responseMimeType application/json`, fixed schema per type, caption as type hint.
- Key rotation: sequential over comma-separated keys (DB `BotSettings.geminiApiKey` first, `GEMINI_API_KEYS` env fallback); 90 s total Gemini deadline with abort; timeout retries only within remaining budget; 503 rotates immediately and stops after two overloaded projects, continue only on quota/rate-limit/key/timeout errors; terminal errors return directly without burning keys.
- Money: kyat integers (`BigInt` in Prisma, JSON `Number` at the API boundary — safe below 2^53, far above any ledger total). Gallons: `Decimal`. Normalize Myanmar digits ၀-၉ before parsing.

## Auth & tenant rules
- `proxy.ts` guard + PUBLIC list is load-bearing; keep `/api/telegram/*` public (secret-header auth) and everything else session-gated.
- Every webhook update passes `checkAuthorization` BEFORE any Gemini/file work. Mode switches check `allowedLedgers`.
- Prisma server code uses service role; browser uses anon key + RLS (owner-only). Never expose service key to client.
- `/setup` is retired. Existing admins provision accounts; public signup stays disabled.

## Data rules
- Uploads stage extracted JSON in `PendingUpload`; only approval mutates live ledger lines. Never reset an approved report to PENDING on a new upload. Rejecting an upload must preserve existing approved data.
- `DailyReport.date` is `@unique` (1 report/day; 4–6 photos merge into it — never a 1-photo cap). `reportDate` comes from the photo content date, upload date is fallback only. Totals are denormalized — recalc on confirm AND on dashboard edit.
- `TelegramMessage @@unique([chatId, messageId])` — keep dedupe. `telegram file_id` is transient; Storage paths are truth.
- Images: no image storage. Resize to 1920px/q75 in memory for Gemini, then discard. SourceImage keeps metadata/raw text only; storagePath and thumbnailPath are null for new rows. Review originals in Telegram.

## Verification gates (run before every PR)
`npm run lint` · `npx tsc --noEmit` · webhook smoke (link→OTP→submit→approve with stubbed Gemini) · extract fixtures per ledger type (including sum/balance mismatch cases) · `npx prisma validate`.

## Commits
Conventional commits (`feat/fix/refactor/docs:`). One logical change per commit. Never commit `.env`, Storage files, or generated Prisma client output.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
