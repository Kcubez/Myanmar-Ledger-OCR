"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "./Modal";
import { useToast } from "./ToastProvider";

/**
 * Single-row delete for list pages (fuel, maintenance). Confirms via Modal,
 * issues DELETE to the given URL, then refreshes the server page.
 */
export function DeleteRowButton({ deleteUrl, label, expectedRevision }: { deleteUrl: string; label: string; expectedRevision?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onConfirm() {
    setBusy(true);
    try {
      const response = await fetch(deleteUrl, expectedRevision ? { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision }) } : { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || "Delete failed.");
      setConfirming(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      <button
        type="button"
        className="row-action row-action-danger"
        aria-label={`Delete ${label}`}
        disabled={busy}
        onClick={() => setConfirming(true)}
      >
        Delete
      </button>
      <Modal
        open={confirming}
        title={`Delete this ${label}?`}
        body="This cannot be undone. Original photos remain in Telegram."
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={onConfirm}
        onCancel={() => {
          if (!busy) setConfirming(false);
        }}
      />
    </span>
  );
}
