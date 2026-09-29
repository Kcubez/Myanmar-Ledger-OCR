"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  TextField,
} from "@mui/material";

export function SetupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message ?? "Setup failed.");
      router.push("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box component="form" onSubmit={submit} sx={{ display: "grid", gap: 2.25 }}>
      {error && (
        <Alert
          severity="error"
          sx={{
            borderRadius: "10px",
            fontSize: "0.85rem",
            py: 0.5,
            "& .MuiAlert-message": { lineHeight: 1.4 },
          }}
        >
          {error}
        </Alert>
      )}

      <TextField
        label="Full Name"
        type="text"
        variant="outlined"
        fullWidth
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="name"
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
        label="Password (min. 8 characters)"
        type={showPassword ? "text" : "password"}
        variant="outlined"
        fullWidth
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        disabled={busy}
        size="medium"
        slotProps={{
          htmlInput: { minLength: 8 },
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
          boxShadow: "0 4px 14px rgba(33, 99, 62, 0.25)",
          "&:hover": {
            bgcolor: "#17452b",
            boxShadow: "0 6px 18px rgba(33, 99, 62, 0.35)",
          },
          "&.Mui-disabled": {
            bgcolor: "rgba(33, 99, 62, 0.6)",
            color: "rgba(255, 255, 255, 0.8)",
          },
        }}
      >
        {busy ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <CircularProgress size={18} color="inherit" thickness={4} />
            <span>Creating admin…</span>
          </Box>
        ) : (
          "Create admin"
        )}
      </Button>
    </Box>
  );
}
