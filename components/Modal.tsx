"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from "@mui/material";

/**
 * Reusable confirm modal (app-styled replacement for window.confirm).
 *
 * Usage:
 *   const [confirming, setConfirming] = useState(false);
 *   <Modal
 *     open={confirming}
 *     title="Delete 24 fuel entries?"
 *     body="This cannot be undone. Source photos are kept."
 *     confirmLabel="Delete"
 *     danger
 *     busy={busy}
 *     onConfirm={doDelete}
 *     onCancel={() => setConfirming(false)}
 *   />
 */
export function Modal({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: string | ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Auto-focus the confirm button only on the closed→open transition.
  // (Dialog gets disableAutoFocus so MUI never steals focus on re-renders —
  // otherwise every keystroke in a modal input would rip focus to Save.)
  useEffect(() => {
    if (open && !wasOpen.current) confirmRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => {
        if (reason === "backdropClick" || reason === "escapeKeyDown") onCancel();
      }}
      disableAutoFocus
      maxWidth="xs"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: "14px", border: "1px solid var(--line)" } } }}
      aria-label={title}
    >
      <DialogTitle sx={{ pb: 1 }}>{title}</DialogTitle>
      <DialogContent>
        {typeof body === "string" ? (
          body && <p className="muted" style={{ margin: 0, whiteSpace: "pre-line" }}>{body}</p>
        ) : (
          body
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button
          onClick={onCancel}
          disabled={busy}
          sx={{ bgcolor: "var(--soft)", color: "var(--leaf)", "&:hover": { bgcolor: "primary.light" } }}
        >
          {cancelLabel}
        </Button>
        <Button
          ref={confirmRef}
          onClick={onConfirm}
          disabled={busy || confirmDisabled}
          variant="contained"
          color={danger ? "error" : "primary"}
        >
          {busy ? "Working…" : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
