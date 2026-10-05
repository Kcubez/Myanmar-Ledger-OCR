import { GoogleGenAI } from "@google/genai";

/**
 * Shared Gemini mechanics: key parsing, masking, retry classification,
 * sequential failover, and number normalization (incl. Myanmar digits).
 * No ledger-type knowledge lives here — see lib/extract/<type>.ts.
 */

export type UsedKey = { slot: number; masked: string };

export class TerminalExtractError extends Error {}
export class ExtractTimeoutError extends Error {}

/** One failed key attempt — logged per slot, summarized on exhaustion. */
export type ExtractAttempt = {
  slot: number;
  code: string;
  reason: "quota" | "key" | "overloaded" | "timeout" | "unknown";
};

export class RetryableExhaustedError extends Error {
  attempts: ExtractAttempt[] = [];
}

export type ExtractReason = ExtractAttempt["reason"] | "unavailable";

/** Race a promise against a timeout; the loser is discarded. */
function withTimeout<T>(promise: Promise<T>, ms: number, controller: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      reject(new ExtractTimeoutError(`Gemini timed out after ${ms}ms`));
      controller.abort();
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const RETRYABLE =
  /429|resource_exhausted|quota|rate.?limit|api key.*(invalid|not valid|disabled|expired)|permission denied|fetch failed|network|ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up|timed? ?out|50\d|internal error|overloaded|unavailable|bad gateway|gateway timeout|service unavailable/i;

export function isRetryableMessage(message: string): boolean {
  return RETRYABLE.test(message);
}

/**
 * Classify a retryable failure for logs and staff-facing messages.
 * Order matters: quota first (most common burst cause), then bad-key
 * (admin-actionable), overload, network/timeout.
 */
export function classifyAttempt(message: string): { code: string; reason: ExtractAttempt["reason"] } {
  if (/429|resource_exhausted|quota|rate.?limit/i.test(message)) return { code: "429", reason: "quota" };
  if (/api key.*(invalid|not valid|disabled|expired)|permission denied|API_KEY_INVALID/i.test(message)) {
    return { code: "403", reason: "key" };
  }
  if (/HTTP 400|invalid argument/i.test(message)) return { code: "400", reason: "key" };
  if (/503|overloaded|UNAVAILABLE|unavailable|500|502|504|internal error|bad gateway|gateway timeout|service unavailable/i.test(message)) {
    return { code: "503", reason: "overloaded" };
  }
  if (/timed? ?out|ETIMEDOUT|socket hang up|ECONNRESET|ECONNREFUSED|fetch failed|network/i.test(message)) {
    return { code: "timeout", reason: "timeout" };
  }
  return { code: "?", reason: "unknown" };
}

/** Majority reason across attempts (tie-break: quota > key > overloaded > timeout). */
export function dominantReason(attempts: ExtractAttempt[]): ExtractReason {
  if (!attempts.length) return "unavailable";
  const rank: ExtractAttempt["reason"][] = ["quota", "key", "overloaded", "timeout", "unknown"];
  const counts = new Map<ExtractAttempt["reason"], number>();
  for (const attempt of attempts) counts.set(attempt.reason, (counts.get(attempt.reason) ?? 0) + 1);
  let best: ExtractAttempt["reason"] = "unknown";
  let bestCount = -1;
  for (const reason of rank) {
    const count = counts.get(reason) ?? 0;
    if (count > bestCount) {
      best = reason;
      bestCount = count;
    }
  }
  return best;
}

/** Parse a comma-separated key env var into a trimmed, non-empty list. */
export function parseKeyList(value: string | undefined | null): string[] {
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
 * - Total Gemini time is bounded to 90s, including retries. Requests are aborted
 *   at the deadline. Timeout retries use only the remaining budget.
 * - Model overload gets bounded exponential-backoff retries on the same key
 *   before failover. This avoids needlessly consuming healthy key slots during
 *   a short provider-capacity spike; at most two overloaded key slots are used.
 *   Quota/key errors can still try all configured projects within the budget.
 * - Throws TerminalExtractError immediately for anything else.
 * - Throws RetryableExhaustedError when every key failed retryably.
 */
export async function extractWithKeyRotation<T>(options: {
  keys: string[];
  model: string;
  parts: GeminiPart[];
  maxOutputTokens?: number;
  timeoutMs?: number;
  timeoutRetries?: number;
  totalTimeoutMs?: number;
  diagnosticLabel?: string;
  /** Called before an overload retry, for user-facing progress updates. */
  onRetry?: (info: { reason: "overloaded"; slot: number; retry: number; retryInMs: number }) => void | Promise<void>;
  /** Test hook; production uses a jittered exponential delay. */
  retryDelayMs?: (retry: number) => number;
  parse: (text: string) => T;
}): Promise<{ result: T; usedKey: UsedKey }> {
  const timeoutMs = options.timeoutMs ?? 90_000;
  const timeoutRetries = options.timeoutRetries ?? 1;
  const deadline = Date.now() + (options.totalTimeoutMs ?? 90_000);
  let overloadedFailures = 0;
  let retryableFailure = false;
  const attempts: ExtractAttempt[] = [];
  const overloadRetriesPerKey = 2;
  const delayForRetry = options.retryDelayMs ?? ((retry: number) => {
    const base = Math.min(8_000, 1_000 * 2 ** (retry - 1));
    return Math.round(base * (0.8 + Math.random() * 0.4));
  });
  rotation: for (const [index, key] of options.keys.entries()) {
    let attempt = 0;

    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break rotation;
      const attemptTimeout = Math.min(timeoutMs, remaining);
      const controller = new AbortController();
      attempt += 1;
      const startedAt = Date.now();
      const diagnostic = () => ({ model: options.model, ledger: options.diagnosticLabel, slot: index + 1, attempt, elapsedMs: Date.now() - startedAt });
      try {
        // Own retry policy here: SDK defaults to 5 attempts and would otherwise
        // multiply retries across all project keys behind this loop.
        const ai = new GoogleGenAI({ apiKey: key, httpOptions: { retryOptions: { attempts: 1 }, timeout: attemptTimeout } });
        const response = await withTimeout(
          ai.models.generateContent({
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
              abortSignal: controller.signal,
              ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
            },
          }),
          attemptTimeout,
          controller,
        );
        if (options.diagnosticLabel) console.info("Gemini request completed", { ...diagnostic(), finishReason: response.candidates?.[0]?.finishReason, outputChars: response.text?.length ?? 0 });
        const result = options.parse(response.text ?? "{}");
        return { result, usedKey: { slot: index + 1, masked: maskKey(key) } };
      } catch (error) {
        if (options.diagnosticLabel) console.info("Gemini request failed", diagnostic());
        if (error instanceof TerminalExtractError) throw error;
        if (error instanceof ExtractTimeoutError) {
          if (attempt <= timeoutRetries && Date.now() < deadline) {
            console.error(`Gemini key slot ${index + 1} timed out after ${timeoutMs}ms (attempt ${attempt}); retrying same key.`);
            continue;
          }
          console.error(`Gemini key slot ${index + 1} timed out ${attempt}×; rotating.`);
          attempts.push({ slot: index + 1, code: "timeout", reason: "timeout" });
          retryableFailure = true;
          break;
        }
      const message = error instanceof Error ? error.message : "";
      if (isRetryableMessage(message)) {
        const classified = classifyAttempt(message);

        attempts.push({ slot: index + 1, ...classified });
        console.error(
          `Gemini key slot ${index + 1} failed (${classified.code} ${classified.reason})`,
        );
        retryableFailure = true;
        if (classified.reason === "overloaded") {
          const retriesUsed = attempt - 1;
          if (retriesUsed < overloadRetriesPerKey) {
            const remaining = deadline - Date.now();
            const retryInMs = Math.min(delayForRetry(retriesUsed + 1), Math.max(0, remaining));
            try {
              await options.onRetry?.({ reason: "overloaded", slot: index + 1, retry: retriesUsed + 1, retryInMs });
            } catch (progressError) {
              // A Telegram edit is optional observability; it must not cancel extraction.
              console.error("Gemini retry progress update failed", progressError);
            }
            if (retryInMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, retryInMs));
            if (Date.now() < deadline) continue;
          }
          if (++overloadedFailures >= 2) break rotation;
        }
        break; // next key after the bounded same-key retry policy
      }
      throw new TerminalExtractError("Could not extract this image. Please try another image.");
      } // end catch
    } // end per-key retry loop
  } // end key rotation
  const exhausted = new RetryableExhaustedError(
    retryableFailure
      ? "Extraction is temporarily unavailable. Please try again later."
      : "Could not extract this image.",
  );
  exhausted.attempts = attempts;
  throw exhausted;
}
