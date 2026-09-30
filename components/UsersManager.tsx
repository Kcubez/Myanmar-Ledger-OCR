"use client";

import { useEffect, useState } from "react";
import { Pill } from "./layout";
import { useToast } from "./ToastProvider";

type ListedUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean | null;
  createdAt: string;
  botSettings: { isActive: boolean; updatedAt: string } | null;
  _count: { telegramSenders: number };
};

export function UsersManager({ currentUserId }: { currentUserId: string }) {
  const toast = useToast();
  const [users, setUsers] = useState<ListedUser[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function fetchUsers() {
    const response = await fetch("/api/admin/users");
    if (!response.ok) throw new Error("Failed to load users.");
    const data = (await response.json()) as { users: ListedUser[] };
    return data.users;
  }

  async function refresh() {
    setUsers(await fetchUsers());
  }

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const users = await fetchUsers();
        if (!cancelled) setUsers(users);
      } catch {
        if (!cancelled) toast.error("Failed to load users.");
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role: "user" }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message ?? "Create failed.");
      setName("");
      setEmail("");
      setPassword("");
      toast.success("Staff account created. Give them this login + link their Telegram via /link.");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    const data = (await response.json()) as { message?: string };
    if (!response.ok) {
      toast.error(data.message ?? "Update failed.");
      return;
    }
    await refresh().catch(() => toast.error("Failed to reload users."));
  }

  return (
    <div>
      <section className="card pad" style={{ marginBottom: 16 }}>
        <h2>Create staff account</h2>
        <form onSubmit={create} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <label className="muted">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required style={fieldStyle} />
          </label>
          <label className="muted">
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={fieldStyle} />
          </label>
          <label className="muted">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              style={fieldStyle}
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create"}
          </button>
        </form>
      </section>

      <section className="card pad">
        <h2>Users ({users.length})</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Bot</th>
                <th>Senders</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>
                    <Pill tone={user.role === "admin" ? "confirmed" : "pending"}>{user.role}</Pill>
                  </td>
                  <td>{user.banned ? <Pill tone="review">BANNED</Pill> : <Pill tone="confirmed">ACTIVE</Pill>}</td>
                  <td>{user.botSettings ? (user.botSettings.isActive ? "active" : "saved") : "—"}</td>
                  <td>{user._count.telegramSenders}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {user.id !== currentUserId && (
                      <>
                        <button
                          type="button"
                          className="secondary"
                          style={{ padding: "4px 10px", marginRight: 6 }}
                          onClick={() => patch(user.id, { role: user.role === "admin" ? "user" : "admin" })}
                        >
                          {user.role === "admin" ? "Demote" : "Promote"}
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          style={{ padding: "4px 10px" }}
                          onClick={() => patch(user.id, { banned: !user.banned })}
                        >
                          {user.banned ? "Unban" : "Ban"}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const fieldStyle = {
  display: "block",
  minWidth: 180,
  marginTop: 4,
  padding: 9,
  borderRadius: 8,
  border: "1px solid var(--line)",
} as const;
