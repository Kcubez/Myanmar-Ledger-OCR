"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  TextField,
} from "@mui/material";
import { authClient } from "../lib/auth-client";
import { useToast } from "./ToastProvider";

export function LoginForm({ requiredRole }: { requiredRole?: "admin" | "user" }) {
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error: signInError } = await authClient.signIn.email({ email, password });
      if (signInError) {
        toast.error(signInError.message ?? "Sign in failed.");
        return;
      }
      // Role gate runs BEFORE navigation: this portal is strictly for the role.
      if (requiredRole) {
        const session = await authClient.getSession();
        const role = (session?.data?.user as { role?: string } | undefined)?.role;
        if (role !== requiredRole) {
          await authClient.signOut();
          toast.error(`Access denied. This portal is strictly for ${requiredRole}s.`);
          return;
        }
      }
      toast.success("Signed in.");
      router.push(searchParams.get("callbackUrl") ?? (requiredRole === "admin" ? "/admin/users" : "/dashboard"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box component="form" onSubmit={submit} sx={{ display: "grid", gap: 2.25 }}>
      <TextField
        label="Email Address"
        type="email"
        variant="outlined"
        fullWidth
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        disabled={busy}
        size="medium"
        slotProps={{
          input: {
            sx: {
              borderRadius: "10px",
              bgcolor: "#fff",
              "&.Mui-focused fieldset": { borderColor: "var(--leaf)" },
            },
          },
          inputLabel: {
            sx: {
              fontSize: "0.92rem",
              "&.Mui-focused": { color: "var(--leaf)" },
            },
          },
        }}
      />

      <TextField
        label="Password"
        type={showPassword ? "text" : "password"}
        variant="outlined"
        fullWidth
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        disabled={busy}
        size="medium"
        slotProps={{
          input: {
            sx: {
              borderRadius: "10px",
              bgcolor: "#fff",
              "&.Mui-focused fieldset": { borderColor: "var(--leaf)" },
            },
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((prev) => !prev)}
                  edge="end"
                  size="small"
                  sx={{ color: "var(--muted)" }}
                >
                  <span style={{ fontSize: "1rem" }} aria-hidden>
                    {showPassword ? "🙈" : "👁️"}
                  </span>
                </IconButton>
              </InputAdornment>
            ),
          },
          inputLabel: {
            sx: {
              fontSize: "0.92rem",
              "&.Mui-focused": { color: "var(--leaf)" },
            },
          },
        }}
      />

      <Button
        type="submit"
        variant="contained"
        disabled={busy}
        fullWidth
        sx={{
          mt: 0.5,
          py: 1.4,
          borderRadius: "10px",
          bgcolor: "var(--leaf)",
          color: "#fff",
          fontSize: "0.98rem",
          fontWeight: 700,
          textTransform: "none",
          boxShadow: "0 4px 14px rgba(121, 85, 199, 0.25)",
          "&:hover": {
            bgcolor: "primary.dark",
            boxShadow: "0 6px 18px rgba(121, 85, 199, 0.35)",
          },
          "&.Mui-disabled": {
            bgcolor: "rgba(121, 85, 199, 0.6)",
            color: "rgba(255, 255, 255, 0.8)",
          },
        }}
      >
        {busy ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <CircularProgress size={18} color="inherit" thickness={4} />
            <span>Signing in…</span>
          </Box>
        ) : (
          "Sign in"
        )}
      </Button>
    </Box>
  );
}
