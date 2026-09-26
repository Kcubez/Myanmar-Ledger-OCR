"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

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
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Auto-focus the confirm button only on the closed→open transition.
  // (onCancel is an inline arrow in callers, so it must NOT re-trigger focus —
  // otherwise every keystroke in a modal input would rip focus to Save.)
  useEffect(() => {
    if (open && !wasOpen.current) confirmRef.current?.focus();
    wasOpen.current = open;
  }, [open ]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 100,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="card pad"
        style={{ width: "100%", maxWidth: 420 }}
      >
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        {typeof body === "string" ? (
          body && <p className="muted" style={{ whiteSpace: "pre-line" }}>{body}</p>
        ) : (
          body
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={danger ? { background: "#b3261e" } : undefined}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
