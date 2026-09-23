import { GoogleGenAI } from "@google/genai";

/**
 * Shared Gemini mechanics: key parsing, masking, retry classification,
 * sequential failover, and number normalization (incl. Myanmar digits).
 * No ledger-type knowledge lives here — see lib/extract/<type>.ts.
 */

export type UsedKey = { slot: number; masked: string };

export class TerminalExtractError extends Error {}
export class RetryableExhaustedError extends Error {}

const RETRYABLE =
  /429|resource_exhausted|quota|rate.?limit|api key.*(invalid|disabled|expired)|permission denied/i;

export function isRetryableMessage(message: string): boolean {
  return RETRYABLE.test(message);
}

/** Parse a comma-separated key env var into a trimmed, non-empty list. */
export function parseKeyList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
}

/** Parse a JSON-encoded string array of browser-supplied keys (max 10). */
export function parseBrowserKeys(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed
          .filter((key): key is string => typeof key === "string" && key.trim().length > 0)
          .map((key) => key.trim())
          .slice(0, 10)
      : [];
  } catch {
    return [];
  }
}

export function maskKey(key: string): string {
  return key.length <= 4 ? "••••" : `••••••••${key.slice(-4)}`;
}

export function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Normalize Myanmar digits ၀-၉ to 0-9. */
export function normalizeDigits(value: string): string {
  return value.replace(/[၀-၉]/g, (character) => String("၀၁၂၃၄၅၆၇၈၉".indexOf(character)));
}

/** Parse a source-format amount string to a number; unparseable → 0. */
export function amountFrom(value: string): number {
  const digits = normalizeDigits(value).replace(/[^0-9.-]/g, "");
  return Number(digits) || 0;
}

/** Strip markdown fences and parse a JSON object; throws on invalid JSON. */
export function parseJsonObject(text: string): Record<string, unknown> {
  const cleaned = text.replace(/^```json\s*|\s*```$/g, "");
  const parsed: unknown = JSON.parse(cleaned);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new TerminalExtractError("Extraction returned an unexpected shape.");
  }
  return parsed as Record<string, unknown>;
}

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

/**
 * Run one Gemini JSON attempt per key in order.
 * - Continues to the next key only on retryable (quota/rate-limit/key) errors.
 * - Throws TerminalExtractError immediately for anything else.
 * - Throws RetryableExhaustedError when every key failed retryably.
 */
export async function extractWithKeyRotation<T>(options: {
  keys: string[];
  model: string;
  parts: GeminiPart[];
  maxOutputTokens?: number;
  parse: (text: string) => T;
}): Promise<{ result: T; usedKey: UsedKey }> {
  let retryableFailure = false;
  for (const [index, key] of options.keys.entries()) {
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.generateContent({
        model: options.model,
        contents: [
          {
            role: "user",
            parts: options.parts as { text?: string; inlineData?: { mimeType: string; data: string } }[],
          },
        ],
        config: {
          responseMimeType: "application/json",
          temperature: 0,
          ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
        },
      });
      const result = options.parse(response.text ?? "{}");
      return { result, usedKey: { slot: index + 1, masked: maskKey(key) } };
    } catch (error) {
      if (error instanceof TerminalExtractError) throw error;
      const message = error instanceof Error ? error.message : "";
      if (isRetryableMessage(message)) {
        retryableFailure = true;
        continue;
      }
      throw new TerminalExtractError("Could not extract this image. Please try another image.");
    }
  }
  throw new RetryableExhaustedError(
    retryableFailure
      ? "Extraction is temporarily unavailable. Please try again later."
      : "Could not extract this image.",
  );
}
