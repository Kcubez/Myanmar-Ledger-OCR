"use client";

import { useMemo } from "react";
import { SnackbarProvider, closeSnackbar, useSnackbar } from "notistack";
import { IconButton } from "@mui/material";

/** Dismiss button rendered on every toast. */
function DismissAction({ id }: { id: string | number }) {
  return (
    <IconButton
      size="small"
      aria-label="Dismiss notification"
      onClick={() => closeSnackbar(id)}
      sx={{ color: "inherit", opacity: 0.8 }}
    >
      ✕
    </IconButton>
  );
}

/** Top-right auto-dismiss toasts (success / error / warning). */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <SnackbarProvider
      maxSnack={3}
      anchorOrigin={{ vertical: "top", horizontal: "right" }}
      autoHideDuration={4000}
      action={(id) => <DismissAction id={id} />}
    >
      {children}
    </SnackbarProvider>
  );
}

/** Transient feedback helper — replaces inline error/status <p> blocks. */
export function useToast() {
  const { enqueueSnackbar } = useSnackbar();
  // Stable identity so handlers can safely list `toast` in effect deps.
  return useMemo(
    () => ({
      success: (message: string) => enqueueSnackbar(message, { variant: "success" }),
      error: (message: string) => enqueueSnackbar(message, { variant: "error" }),
      warn: (message: string) => enqueueSnackbar(message, { variant: "warning" }),
    }),
    [enqueueSnackbar],
  );
}
