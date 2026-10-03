"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "./Modal";
import { useToast } from "./ToastProvider";

/**
 * Range-scoped bulk delete for ledger pages. The server page passes the
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
  category,
  variant,
}: {
  kind: "fuel" | "brick" | "revenue" | "expense" | "inventory" | "maintenance";
  category?: string;
  variant?: string;
  inline?: boolean;
  kindLabel: string;
  count: number;
  scopeLabel: string;
  gte: string | null;
  lte: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const what = count === 1 ? `1 ${kindLabel} entry` : `${count} ${kindLabel} entries`;

  async function onConfirm() {
    setBusy(true);
    try {
      const response = await fetch("/api/ledger-entries", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, gte, lte, category, variant }),
      });
      if (!response.ok) throw new Error("Delete failed.");
      setConfirming(false);
      router.refresh();
    } catch {
      toast.error("Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <button
        type="button"
        className="delete-range-button"

        disabled={busy || count === 0}
        title={count === 0 ? "Nothing in this range" : `Delete ${count} ${kindLabel} entries in ${scopeLabel}`}
        onClick={() => setConfirming(true)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" /></svg> Delete
      </button>
      <Modal
        open={confirming}
        title={`Delete ${what} in ${scopeLabel}?`}
        body="This permanently deletes the selected approved entries. Other ledger types and pending uploads are unchanged. Originals remain in Telegram."
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
