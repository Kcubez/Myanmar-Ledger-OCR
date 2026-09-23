/**
 * Minimal Supabase Storage client (service role) over plain REST.
 * No extra dependency — bucket must exist (created once by the owner).
 */

const BUCKET = "ledger-images";

function config() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
}

export function storageConfigured(): boolean {
  return config() !== null;
}

/** Upload a buffer to Storage; returns the storage path on success. */
export async function uploadImage(path: string, buffer: Buffer, contentType: string): Promise<string | null> {
  const cfg = config();
  if (!cfg) {
    console.error("Supabase storage not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
    return null;
  }
  try {
    const response = await fetch(
      `${cfg.url}/storage/v1/object/${BUCKET}/${path}`,
      {
        method: "POST",
        headers: {
          apikey: cfg.serviceKey,
          Authorization: `Bearer ${cfg.serviceKey}`,
          "Content-Type": contentType,
          "x-upsert": "true",
        },
        body: new Uint8Array(buffer),
      },
    );
    if (!response.ok) {
      console.error("Supabase storage upload failed:", response.status, await response.text());
      return null;
    }
    return `${BUCKET}/${path}`;
  } catch (error) {
    console.error("Supabase storage upload error:", error);
    return null;
  }
}

/** Build a public/download path reference stored in the DB (bucket-qualified). */
export function storagePath(dateKey: string, ledgerType: string, messageId: number, thumb = false): string {
  return `reports/${dateKey}/${ledgerType}-${messageId}${thumb ? ".thumb" : ""}.jpg`;
}

/** Create a time-limited signed URL for a private-bucket object. */
export async function signImage(bucketPath: string, expiresIn = 3600): Promise<string | null> {
  const cfg = config();
  if (!cfg) return null;
  const slash = bucketPath.indexOf("/");
  const bucket = slash < 0 ? BUCKET : bucketPath.slice(0, slash);
  const path = slash < 0 ? bucketPath : bucketPath.slice(slash + 1);
  try {
    const response = await fetch(`${cfg.url}/storage/v1/object/sign/${bucket}/${path}`, {
      method: "POST",
      headers: {
        apikey: cfg.serviceKey,
        Authorization: `Bearer ${cfg.serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn }),
    });
    if (!response.ok) {
      console.error("Supabase sign failed:", response.status, await response.text());
      return null;
    }
    const data = (await response.json()) as { signedURL?: string };
    return data.signedURL ? `${cfg.url}${data.signedURL}` : null;
  } catch (error) {
    console.error("Supabase sign error:", error);
    return null;
  }
}
