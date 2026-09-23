"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "../lib/auth-client";

export function LoginForm({ requiredRole }: { requiredRole?: "admin" | "user" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { error: signInError } = await authClient.signIn.email({ email, password });
      if (signInError) {
        setError(signInError.message ?? "Sign in failed.");
        return;
      }
      // Role gate runs BEFORE navigation: this portal is strictly for the role.
      if (requiredRole) {
        const session = await authClient.getSession();
        const role = (session?.data?.user as { role?: string } | undefined)?.role;
        if (role !== requiredRole) {
          await authClient.signOut();
          setError(`Access denied. This portal is strictly for ${requiredRole}s.`);
          return;
        }
      }
      router.push(searchParams.get("callbackUrl") ?? (requiredRole === "admin" ? "/admin/users" : "/dashboard"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label className="muted">
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </label>
      <label className="muted">
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </label>
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
