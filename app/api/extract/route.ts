import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const RETRYABLE = /429|resource_exhausted|quota|rate.?limit|api key.*(invalid|disabled|expired)|permission denied/i;

const LEDGER_COLUMNS = ["နေ့စွဲ", "ဝင်ငွေ", "ထွက်ငွေ", "အမြတ်"];
type ExtractedRow = { date?: unknown; revenue?: unknown; expense?: unknown };

function asText(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function amount(value: string) {
  const digits = value.replace(/[၀-၉]/g, (character) => String("၀၁၂၃၄၅၆၇၈၉".indexOf(character))).replace(/[^0-9.-]/g, "");
  return Number(digits) || 0;
}
function profit(revenue: string, expense: string) {
  if (!revenue && !expense) return "";
  const value = amount(revenue) - amount(expense);
  const currency = /ကျပ်|kyat|mmk/i.test(`${revenue} ${expense}`) ? " ကျပ်" : "";
  return `${value.toLocaleString("en-US")}${currency}`;
}
function cleanRows(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((row: ExtractedRow) => {
    const date = asText(row?.date);
    const revenue = asText(row?.revenue);
    const expense = asText(row?.expense);
    return [date, revenue, expense, profit(revenue, expense)];
  });
}

function parseResponse(text: string) {
  const parsed: unknown = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ""));
  const data = parsed as { rawText?: unknown; rows?: unknown };
  return { rawText: typeof data.rawText === "string" ? data.rawText : "", columns: LEDGER_COLUMNS, rows: cleanRows(data.rows) };
}

function maskKey(key: string) {
  return key.length <= 4 ? "••••" : `••••••••${key.slice(-4)}`;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const image = formData.get("image");
  if (!(image instanceof File)) return NextResponse.json({ error: "Please choose an image." }, { status: 400 });
  if (!ALLOWED_TYPES.has(image.type)) return NextResponse.json({ error: "Only JPG, PNG, and WEBP images are supported." }, { status: 400 });
  if (image.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Image must be 10 MB or smaller." }, { status: 400 });

  const keys = (process.env.GEMINI_API_KEYS ?? "").split(",").map((key) => key.trim()).filter(Boolean);
  if (!keys.length) return NextResponse.json({ error: "Extraction is not configured yet." }, { status: 503 });

  const base64 = Buffer.from(await image.arrayBuffer()).toString("base64");
  const prompt = `Extract only financial ledger rows from this Myanmar handwritten document. Return ONLY valid JSON with this exact shape:\n{"rawText":"all legible source text","rows":[{"date":"source date or empty string","revenue":"income amount in source format or empty string","expense":"expense amount in source format or empty string"}]}\nNever return any other row fields or keys. Ignore unsupported document columns such as balance, customer name, payment method, category, account number, or notes. Do not invent unclear values. Preserve source date and amount formats. A row may have revenue, expense, or both empty only when the document is unclear.`;

  let retryableFailure = false;
  for (const [index, key] of keys.entries()) {
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: image.type, data: base64 } }] }],
        config: { responseMimeType: "application/json", temperature: 0 },
      });
      return NextResponse.json({ ...parseResponse(response.text ?? "{}"), usedKey: { slot: index + 1, masked: maskKey(key) } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (RETRYABLE.test(message)) { retryableFailure = true; continue; }
      return NextResponse.json({ error: "Could not extract this image. Please try another image." }, { status: 502 });
    }
  }
  return NextResponse.json({ error: retryableFailure ? "Extraction is temporarily unavailable. Please try again later." : "Could not extract this image." }, { status: 503 });
}
