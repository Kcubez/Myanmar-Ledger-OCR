import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type KeyState = "working" | "rate_limited" | "invalid" | "unavailable";
type KeyResult = { slot: number; masked: string; state: KeyState };

function configuredKeys() {
  return (process.env.GEMINI_API_KEYS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
}

function maskKey(key: string) {
  return key.length <= 4 ? "••••" : `••••••••${key.slice(-4)}`;
}

function classify(error: unknown): KeyState {
  const message = error instanceof Error ? error.message : "";
  if (/429|resource_exhausted|quota|rate.?limit/i.test(message)) return "rate_limited";
  if (/api.?key|permission|unauthenticated|forbidden|invalid.*key/i.test(message)) return "invalid";
  return "unavailable";
}

export async function GET() {
  const keys = configuredKeys();
  return NextResponse.json({ keys: keys.map((key, index) => ({ slot: index + 1, masked: maskKey(key), state: "unavailable" as const })) });
}

export async function POST() {
  const keys = configuredKeys();
  if (!keys.length) return NextResponse.json({ error: "No Gemini API keys are configured." }, { status: 503 });

  const results: KeyResult[] = [];
  for (const [index, key] of keys.entries()) {
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      await ai.models.generateContent({ model: "gemini-2.5-flash", contents: "Reply only with OK.", config: { maxOutputTokens: 4 } });
      results.push({ slot: index + 1, masked: maskKey(key), state: "working" });
    } catch (error) {
      results.push({ slot: index + 1, masked: maskKey(key), state: classify(error) });
    }
  }
  return NextResponse.json({ keys: results });
}
