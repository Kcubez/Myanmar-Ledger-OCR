"use client";

import { useEffect, useState } from "react";
import { LEDGER_TYPES } from "../lib/extract";

type BotSettings = {
  botToken: string;
  geminiApiKey: string;
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
  isDataApprover: boolean;
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
  const [preApprover, setPreApprover] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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

  const token = tokenDraft ?? settings?.botToken ?? "";
  const key = keyDraft ?? settings?.geminiApiKey ?? "";
  const dirty = tokenDraft !== null || keyDraft !== null;

  async function saveBot() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/settings/bot", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: token, geminiApiKey: key, geminiModel: model }),
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
        body: JSON.stringify({ email: preEmail, allowedLedgers: preScopes, isDataApprover: preApprover }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message ?? "Pre-register failed.");
      setPreEmail("");
      setPreScopes([]);
      setPreApprover(false);
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
              Bot token <small>(BotFather — masked, paste to replace)</small>
              <input value={token} onChange={(e) => setTokenDraft(e.target.value)} placeholder="123456:ABC-..." autoComplete="off" />
            </label>
            <label className="muted">
              Gemini API key
              <input value={key} onChange={(e) => setKeyDraft(e.target.value)} placeholder="AI…" autoComplete="off" />
            </label>
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
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: ".88rem" }}>
                <input type="checkbox" checked={preApprover} onChange={(e) => setPreApprover(e.target.checked)} />
                Can approve (data approver)
              </label>
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
                    <th>Approver</th>
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
                      <td>{sender.isDataApprover ? "yes" : "no"}</td>
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
                          style={{ padding: "4px 10px" }}
                          onClick={() => toggleSender(sender.id, { isDataApprover: !sender.isDataApprover })}
                        >
                          {sender.isDataApprover ? "Unapprover" : "Approver"}
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
