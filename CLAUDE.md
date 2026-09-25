# CLAUDE.md — AI assistant bootstrap

## Repo map
- `PRD.md` — requirements + acceptance. `ARCHITECTURE.md` — full design. `ARCHITECTURE-ESSENTIALS.md` — runtime cheat sheet. `AGENTS.md` — working agreement (read it before editing).
- Code: `app/api/telegram/webhook/` (bot ingress) · `lib/extract/<revenue|expense|maintenance|fuel|brick>.ts` (parsers) · `lib/telegram/` (client/templates/senders) · `app/dashboard|fuel|brick|reports|approvals|settings|admin` pages · `components/DateFilter|DeleteRangeButton|Modal` (reusable UI) · `prisma/schema.prisma`.
- BAI reference (`../business-ai-integration-service`): canonical Telegram/auth/chart patterns — copy semantics, don't diverge.

## Commands
`npm run dev` · `npm run build` · `npm run start` · `npm run lint` · `npx tsc --noEmit` · `npx prisma generate` · `npx prisma db push` · `npx prisma validate`.

## Setup (local)
1. `cp .env.local.example .env.local`, fill server-only vars (`DATABASE_URL/DIRECT_URL`, `SUPABASE_*`, `TELEGRAM_BOT_TOKEN/WEBHOOK_SECRET`, `GEMINI_API_KEYS`, `BETTER_AUTH_SECRET`, `BREVO_*`). Never add keys to `NEXT_PUBLIC_`.
2. `npm install && npx prisma generate && npx prisma db push && npm run dev`.
3. Open `/setup`, create first admin (locks after). Set bot token + webhook secret, register Telegram webhook to `/api/telegram/webhook`.
4. Pre-register staff in `/admin` (email + allowedLedgers + approver flag); staff runs `/link` + OTP in Telegram.

## Common tasks
- Add a ledger field: update parser schema + heuristic + Prisma model + migration + dashboard form + fixture (match + mismatch case).
- Add a chart: extend SVG chart pattern, feed from TanStack Query hook, no new deps.
- Onboard staff: admin pre-registration → staff `/link` → verify in `/api/senders`.
- Rotate key: update `BotSettings` via `/settings` (or env + redeploy for fallback).

## Pitfalls
- BigInt amounts crash JSON — serialize at API boundary. Myanmar digits must be normalized pre-parse. `telegram file_id` expires — Storage is truth. Webhook must 200 fast (`after()` for heavy work) or Telegram retries. Supabase Free pauses after 7 idle days; Hobby is non-commercial and 60 s-capped.

## Definition of done
Lint + typecheck clean · fixtures pass per touched ledger type · webhook smoke (submit→approve) with stubbed Gemini · no secret committed · totals recalc verified on confirm + edit.
