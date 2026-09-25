"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "./Modal";

/**
 * Single-row delete for list pages (fuel, maintenance). Confirms via Modal,
 * issues DELETE to the given URL, then refreshes the server page.
 */
export function DeleteRowButton({ deleteUrl, label }: { deleteUrl: string; label: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onConfirm() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(deleteUrl, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed.");
      setConfirming(false);
      router.refresh();
    } catch {
      setError("Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      <button
        type="button"
        className="delete"
        aria-label={`Delete ${label}`}
        disabled={busy}
        onClick={() => setConfirming(true)}
      >
        ×
      </button>
      {error && (
        <span role="alert" style={{ color: "#b3261e", fontSize: ".8rem" }}>
          {error}
        </span>
      )}
      <Modal
        open={confirming}
        title={`Delete this ${label}?`}
        body="This cannot be undone. Source photos are kept."
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
