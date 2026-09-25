"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "./Modal";

/**
 * Range-scoped bulk delete for fuel/brick pages. The server page passes the
 * active filter range + entry count; the button confirms via Modal and
 * refreshes after deletion.
 */
export function DeleteRangeButton({
  kind,
  kindLabel,
  count,
  scopeLabel,
  gte,
  lte,
}: {
  kind: "fuel" | "brick";
  kindLabel: string;
  count: number;
  scopeLabel: string;
  gte: string | null;
  lte: string | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const what = count === 1 ? `1 ${kindLabel} entry` : `${count} ${kindLabel} entries`;

  async function onConfirm() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/ledger-entries", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, gte, lte }),
      });
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
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <button
        type="button"
        className="secondary"
        style={{ padding: "6px 12px", color: "#b3261e" }}
        disabled={busy || count === 0}
        title={count === 0 ? "Nothing in this range" : `Delete ${count} ${kindLabel} entries in ${scopeLabel}`}
        onClick={() => setConfirming(true)}
      >
        Delete
      </button>
      {error && (
        <span role="alert" style={{ color: "#b3261e", fontSize: ".8rem" }}>
          {error}
        </span>
      )}
      <Modal
        open={confirming}
        title={`Delete ${what} in ${scopeLabel}?`}
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
