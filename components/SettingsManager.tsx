"use client";

import { useEffect, useState } from "react";
import { LEDGER_TYPES } from "../lib/extract";
import { Modal } from "./Modal";

type BotSettings = {
  botToken: string;
  geminiApiKey: string;
  keyCount: number;
  keyTails: string[];
  geminiModel: string;
  isActive: boolean;
  usingEnvFallback: boolean;
};

type Sender = {
  id: string;
  displayName: string | null;
  email: string | null;
  telegramUserId: string | null;
  isVerified: boolean;
  isAuthorized: boolean;
  allowedLedgers: string[];
};

const LEDGER_LABELS: Record<string, string> = {
  revenue: "Revenue",
  expense: "Expense",
  maintenance: "Maintenance",
  fuel: "Fuel",
  brick: "Brick",
};

export function SettingsManager() {
  const [tab, setTab] = useState<"bot" | "senders">("bot");
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [tokenDraft, setTokenDraft] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState<string | null>(null);
  const [model, setModel] = useState("gemini-3.5-flash");
  const [senders, setSenders] = useState<Sender[]>([]);
  const [preEmail, setPreEmail] = useState("");
  const [preScopes, setPreScopes] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Sender | null>(null);

  async function fetchState() {
    const [botRes, sendersRes] = await Promise.all([fetch("/api/settings/bot"), fetch("/api/senders")]);
    return { botRes, sendersRes };
  }

  async function load() {
    const { botRes, sendersRes } = await fetchState();
    if (botRes.ok) {
      const data = (await botRes.json()) as { settings: BotSettings };
      setSettings(data.settings);
      setModel(data.settings.geminiModel);
    }
    if (sendersRes.ok) {
      const data = (await sendersRes.json()) as { senders: Sender[] };
      setSenders(data.senders);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const { botRes, sendersRes } = await fetchState();
        if (cancelled) return;
        if (botRes.ok) {
          const data = (await botRes.json()) as { settings: BotSettings };
          if (cancelled) return;
          setSettings(data.settings);
          setModel(data.settings.geminiModel);
        }
        if (sendersRes.ok) {
          const data = (await sendersRes.json()) as { senders: Sender[] };
          if (cancelled) return;
          setSenders(data.senders);
        }
      } catch {
        if (!cancelled) setError("Failed to load settings.");
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = tokenDraft !== null || keyDraft !== null;

  async function saveBot() {
    setBusy(true);
    setError("");
    setMessage("");
    // Masked values (•) can never be extended — the server would discard the
    // whole field as "unchanged". Force a full re-paste instead of a silent skip.
    if ((tokenDraft ?? "").includes("•") || (keyDraft ?? "").includes("•")) {
      setBusy(false);
      setError("Secret fields show masked values — clear the field and paste the FULL value (all keys, comma-separated).");
      return;
    }
    try {
      const response = await fetch("/api/settings/bot", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // Omit untouched secrets entirely — sending "" would clear them.
        body: JSON.stringify({
          ...(tokenDraft !== null ? { botToken: tokenDraft } : {}),
          ...(keyDraft !== null ? { geminiApiKey: keyDraft } : {}),
          geminiModel: model,
        }),
      });
      const data = (await response.json()) as {
        message?: string;
        settings?: BotSettings;
        webhookRegistered?: boolean;
        webhookUrl?: string | null;
        warning?: string;
      };
      if (!response.ok) throw new Error(data.message ?? "Save failed.");
      if (data.settings) {
        setSettings(data.settings);
        setTokenDraft(null);
        setKeyDraft(null);
      }
      setMessage(
        data.webhookRegistered
          ? `Saved — webhook registered (${data.webhookUrl}).`
          : data.warning ?? "Saved.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function preRegister(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/settings/senders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: preEmail, allowedLedgers: preScopes }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message ?? "Pre-register failed.");
      setPreEmail("");
      setPreScopes([]);
      setMessage("Staff pre-registered. They link via /link + OTP in Telegram.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pre-register failed.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleSender(id: string, patch: Record<string, unknown>) {
    const response = await fetch("/api/senders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    if (!response.ok) {
      setError("Sender update failed.");
      return;
    }
    await load();
  }

  async function deleteSender(id: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/senders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error("Sender delete failed.");
      setDeleting(null);
      await load();
    } catch {
      setError("Sender delete failed.");
    } finally {
      setBusy(false);
    }
  }
  const toggleScope = (scope: string) =>
    setPreScopes((scopes) => (scopes.includes(scope) ? scopes.filter((s: string) => s !== scope) : [...scopes, scope]));

  return (
    <div>
      {error && (
        <p role="alert" className="auth-error" style={{ marginBottom: 12 }}>
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="status" style={{ width: "auto", marginBottom: 12 }}>
          {message}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["bot", "senders"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={tab === t ? undefined : "secondary"}
            onClick={() => setTab(t)}
          >
            {t === "bot" ? "🤖 Bot" : "👥 Senders"}
          </button>
        ))}
      </div>

      {tab === "bot" && (
        <section className="card pad">
          <h2>
            Telegram bot {settings?.isActive ? <span className="pill confirmed">ACTIVE</span> : <span className="pill pending">INACTIVE</span>}
          </h2>
          {settings?.usingEnvFallback && (
            <p className="muted">Using environment config — save here once to migrate into the database.</p>
          )}
          <div className="auth-form" style={{ maxWidth: 520 }}>
            <label className="muted">
              Bot token <small>(BotFather — paste to replace)</small>
              <input
                value={tokenDraft ?? ""}
                onChange={(e) => setTokenDraft(e.target.value)}
                placeholder={settings?.botToken ? `${settings.botToken} — paste to replace` : "123456:ABC-..."}
                autoComplete="off"
              />
            </label>
            <label className="muted">
              Gemini API key <small>(comma-separated for rotation: key1, key2 — saving replaces ALL keys)</small>
              <input
                value={keyDraft ?? ""}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder={
                  settings?.geminiApiKey
                    ? `${settings.geminiApiKey} — paste ALL keys to replace`
                    : "AI…"
                }
                autoComplete="off"
              />
            </label>
            {settings && settings.keyCount > 0 && (
              <p className="muted" style={{ margin: 0 }}>
                {settings.keyCount} key{settings.keyCount === 1 ? "" : "s"} saved ({settings.keyTails.map((tail) => `…${tail}`).join(", ")})
              </p>
            )}
            <label className="muted">
              Gemini model
              <input value={model} onChange={(e) => setModel(e.target.value)} />
            </label>
            <div>
              <button type="button" onClick={saveBot} disabled={busy || !dirty}>
                {busy ? "Saving…" : "Save & register webhook"}
              </button>
            </div>
          </div>
        </section>
      )}

      {tab === "senders" && (
        <>
          <section className="card pad" style={{ marginBottom: 16 }}>
            <h2>Pre-register staff</h2>
            <form onSubmit={preRegister} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
              <label className="muted">
                Staff email
                <input type="email" value={preEmail} onChange={(e) => setPreEmail(e.target.value)} required style={fieldStyle} />
              </label>
              <div>
                <p className="muted" style={{ margin: "0 0 6px" }}>Allowed ledgers</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {LEDGER_TYPES.map((scope) => (
                    <label key={scope} style={{ display: "flex", gap: 5, alignItems: "center", fontSize: ".88rem" }}>
                      <input type="checkbox" checked={preScopes.includes(scope)} onChange={() => toggleScope(scope)} />
                      {LEDGER_LABELS[scope]}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <button type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Pre-register"}
                </button>
              </div>
            </form>
          </section>

          <section className="card pad">
            <h2>Senders ({senders.length})</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Linked</th>
                      <th>Scopes</th>
                      <th />
                  </tr>
                </thead>
                <tbody>
                  {senders.map((sender) => (
                    <tr key={sender.id}>
                      <td>{sender.displayName ?? "—"}</td>
                      <td>{sender.email ?? "—"}</td>
                      <td>
                        {sender.telegramUserId ? (
                          <span className="pill confirmed">LINKED</span>
                        ) : (
                          <span className="pill pending">PENDING</span>
                        )}
                      </td>
                      <td style={{ fontSize: ".8rem" }}>{sender.allowedLedgers.join(", ") || "—"}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          className="secondary"
                          style={{ padding: "4px 10px", marginRight: 6 }}
                          onClick={() => toggleSender(sender.id, { isAuthorized: !sender.isAuthorized })}
                        >
                          {sender.isAuthorized ? "Revoke" : "Authorize"}
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          style={{ padding: "4px 10px", color: "#b3261e" }}
                          onClick={() => setDeleting(sender)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      <Modal
        open={deleting !== null}
        title={`Remove sender ${deleting?.displayName ?? ""}?`}
        body="They will need to /link again."
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={() => {
          if (deleting) void deleteSender(deleting.id);
        }}
        onCancel={() => {
          if (!busy) setDeleting(null);
        }}
      />
    </div>
  );
}

const fieldStyle = {
  display: "block",
  width: "100%",
  marginTop: 4,
  padding: 9,
  borderRadius: 8,
  border: "1px solid var(--line)",
} as const;
