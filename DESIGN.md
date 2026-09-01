# Myanmar Ledger OCR — Design

## Purpose

Build a Next.js test web app that extracts Myanmar handwritten revenue and expense ledger entries from a single uploaded image using Gemini, lets users review and edit the result, and saves it only in the current browser.

## Confirmed scope

- Accept one JPG, PNG, or WEBP image at a time (up to 10 MB).
- Extract raw text and an editable ledger table.
- Use columns: `နေ့စွဲ | ဝင်ငွေ | ထွက်ငွေ | အကြောင်းအရာ`.
- Preserve dates and monetary values in the source format.
- Show calculated income, expense, and difference totals.
- Save the original image, raw text, edited rows, and timestamps in browser IndexedDB.
- Support create, list/read, edit/update, and delete for saved results.
- Keep Gemini keys server-only in local/Vercel environment variables.
- Fail over within a request only when an API key receives quota/rate-limit/key-specific failures.
- Support local development and team-protected Vercel previews.

## Non-goals

- No database, account/login system, CSV export, PDF/multi-page flow, or cross-device sync.
- No production accounting/audit workflow.

## Architecture

The App Router UI owns image upload, editor state, summaries, and IndexedDB CRUD. A `POST /api/extract` Route Handler validates the image, calls Gemini with a structured JSON extraction prompt, and returns a safe result. The route handler parses `GEMINI_API_KEYS` and tries keys sequentially only for retryable provider errors. It never returns key values or provider internals to the browser.

The client-only IndexedDB repository isolates storage. A record contains an ID, the image `Blob`, image metadata, raw OCR text, editable rows, and timestamps.

## Data shape

```ts
type LedgerRow = {
  id: string;
  date: string;
  income: string;
  expense: string;
  description: string;
};

type SavedLedger = {
  id: string;
  image: Blob;
  imageName: string;
  imageType: string;
  rawText: string;
  rows: LedgerRow[];
  createdAt: string;
  updatedAt: string;
};
```

Amounts remain strings for source fidelity. The client parses a numeric value only for totals, and flags values it cannot parse.

## Error and privacy behaviour

- Reject unsupported or oversize uploads before calling the API.
- Show raw text and an empty editable table if structured parsing is incomplete.
- Warn, but do not block, if a row has both income and expense values.
- Leave existing saved data intact on extraction/network errors.
- Avoid logging images, OCR content, Gemini response bodies, and API keys.
- Warn as IndexedDB approaches 50 records or 200 MB; never delete records automatically.

## Deployment

- Local: real keys reside only in `.env.local`; provide `.env.local.example` without values.
- Vercel: configure `GEMINI_API_KEYS` in project environment variables for preview/deployment use.
- Protect preview access for the team using Vercel Deployment Protection or an equivalent lightweight gate.

## Testing

- Unit-test key rotation, upload validation, data parsing, and editor warnings.
- Test IndexedDB CRUD including recovery after a page refresh.
- Manually test upload → extract → edit → save → refresh → reopen → delete.

## Batch OCR and profit/loss extension

- Accept one to five JPG, PNG, or WEBP images per batch, with a 10 MB per-image and 50 MB total limit.
- Process images sequentially in the browser. Each image calls the existing extraction endpoint independently, preserving per-request key failover and avoiding serverless timeout risk.
- Show current file/progress and keep successful rows when another image fails. Show safe per-image errors after completion.
- Restrict the structured backend and editor schema to `နေ့စွဲ | ဝင်ငွေ | ထွက်ငွေ | အမြတ် | အရှုံး`.
- Gemini extracts only date, revenue, and expense. The server discards any other extracted fields, calculates a positive difference as profit, and calculates a negative difference as loss.
- Store all original image blobs, image-level extraction metadata, combined rows, and failure details as one IndexedDB saved record. Keep an internal source-image reference on each row.
- Show income, expense, profit, loss, and net-result totals. Rows remain editable; schema columns are not editable.

## Decision log

| Decision | Alternatives considered | Reason |
| --- | --- | --- |
| Next.js App Router + Route Handler | Direct browser Gemini call; server queue/cache | Keeps keys secret and fits Vercel without extra infrastructure. |
| IndexedDB including image blobs | Session only; localStorage; cloud DB | Enables local CRUD and source-image review without a database. |
| Four custom ledger columns | Fixed type/category schema | Matches the supplied document format. |
| Store amounts as strings | Normalize all amounts on extraction | Preserves source text for manual review. |
| Request-level sequential failover | Shared key health tracking | Appropriate for a low-volume serverless test app. |
| Upload-only MVP | PDF/camera/multi-page flow | Keeps scope focused. |
| Sequential five-image batches | Parallel batch, server-side batch, background queue | Preserves progress and partial success without database/queue infrastructure. |
| Fixed profit/loss schema | Dynamic columns | Enforces the client-required backend contract and ignores unsupported fields. |
