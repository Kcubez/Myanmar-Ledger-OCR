# Myanmar Ledger OCR

Next.js test app for extracting Myanmar handwritten revenue/expense ledger images with Gemini. Results, including original image blobs, are stored only in the browser's IndexedDB.

## Run locally

1. Copy `.env.local.example` to `.env.local`.
2. Set `GEMINI_API_KEYS` to a comma-separated list of Gemini API keys.
3. Run `npm run dev` and open the displayed local URL.

Example:

```env
GEMINI_API_KEYS=first-key,second-key,third-key
```

Keys are used only by `app/api/extract/route.ts`; never use a `NEXT_PUBLIC_` key variable.

## Key status panel

The top-of-page **Test all keys** control calls the server to test each configured key with a tiny Gemini request. It shows `Working`, `Rate limited`, `Invalid`, or `Unavailable` for each key. The eye-style **Show IDs** control reveals only a masked identifier (last four characters), never a full key value.

## Gemini key failover

The API route tries configured keys in order. It moves to the next key only for quota/rate-limit or key-specific failures. Invalid image and extraction-format errors return directly and do not consume the remaining keys.

## Browser-local data

Saved records are stored in IndexedDB under `myanmar-ledger-ocr`. They stay in the same browser/device after refresh and can be opened, edited, or deleted. Clearing browser site data removes them permanently; nothing is synced to Vercel or a database.

## Vercel preview

Set `GEMINI_API_KEYS` in Vercel Project Settings → Environment Variables for Preview (and Production if required). Enable Deployment Protection so untrusted visitors cannot use your Gemini quota.
