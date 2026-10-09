const methods = ["CASH", "KBZ_PAY", "MMQR", "KBZ_SPECIAL", "AYA_SPECIAL"];
const categories = ["BUSINESS_DRAWING", "PERSONAL_DRAWING", "OPERATION", "WAGES"];
const kinds = ["revenue", "expense", "maintenance", "fuel", "brick"];
const empty = (v: unknown) => v === undefined || v === null || v === "";

function numeric(value: unknown, field: string, decimal = false, optional = false) {
  if (optional && empty(value)) return;
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "" ||
      !/^\d+(?:\.\d+)?$/.test(String(value))) throw new Error(`${field}: enter a non-negative number.`);
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > Number.MAX_SAFE_INTEGER ||
      (!decimal && !Number.isSafeInteger(n)) || (decimal && (String(value).split(".")[1]?.length ?? 0) > 2)) {
    throw new Error(`${field}: invalid amount or precision.`);
  }
  if (decimal && n >= (field === "qty" ? 1e10 : 1e8)) throw new Error(`${field}: quantity is too large.`);
}

export function validateReportPatch(body: unknown): asserts body is Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid edit.");
  const data = body as Record<string, unknown>;
  if (typeof data.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(data.expectedRevision)) throw new Error("Reload the report before editing.");
  if (Object.keys(data).some(key => ![...kinds, "expectedRevision"].includes(key))) throw new Error("Unsupported edit field. Use the submission date endpoint to correct a date.");
  if (!kinds.some(key => key in data)) throw new Error("No rows supplied.");
  for (const kind of kinds) {
    if (!(kind in data)) continue;
    if (!Array.isArray(data[kind])) throw new Error(`${kind}: expected rows.`);
    const seen = new Set<string>();
    for (const row of data[kind] as unknown[]) {
      if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Invalid row.");
      const r = row as Record<string, unknown>;
      if (r.submissionId !== undefined && r.submissionId !== null && (typeof r.submissionId !== "string" || r.submissionId.length > 100)) throw new Error("Invalid submission reference.");
      for (const key of ["name", "vehicle", "part", "particular", "item"]) {
        if (r[key] != null && (typeof r[key] !== "string" || (r[key] as string).length > 1000)) throw new Error(`Invalid ${key}.`);
      }
      if (kind === "revenue") {
        if (!methods.includes(r.method as string) || seen.has(r.method as string)) throw new Error("Invalid or duplicate payment method.");
        seen.add(r.method as string);
      }
      if (kind === "expense" && !categories.includes(r.category as string)) throw new Error("Invalid expense category.");
      if (["revenue", "expense", "maintenance"].includes(kind)) numeric(r.amount, "amount");
      if (kind === "fuel") {
        for (const key of ["inGal", "outGal", "balanceGal"]) numeric(r[key], key, true, true);
        if (r.balanceOk != null && typeof r.balanceOk !== "boolean") throw new Error("Invalid balance check.");
      }
      if (kind === "brick") {
        numeric(r.qty, "qty", true, true);
        numeric(r.amount, "amount", false, true);
        numeric(r.unitPrice, "unitPrice", false, true);
      }
      if (!empty(r.date)) {
        if (typeof r.date !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(r.date)) throw new Error("Invalid row date.");
        const parsed = new Date(r.date);
        if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== r.date.slice(0, 10)) throw new Error("Invalid row date.");
      }
    }
  }
}
