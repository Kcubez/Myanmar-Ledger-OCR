"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";

export function ApprovalButtons({ reportId, uploadId }: { reportId: string; uploadId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [confirmingReject, setConfirmingReject] = useState(false);

  async function act(action: "approve" | "reject") {
    setBusy(true);
    setNote("");
    try {
      const response = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, uploadId, action }),
      });
      if (!response.ok) {
        const failure = await response.json();
        throw new Error(failure.message || "Action failed.");
      }
      const data = (await response.json()) as { telegramUpdated?: boolean };
      if (data.telegramUpdated === false) {
        setNote("Saved, but Telegram update failed — check bot status.");
      }
      if (action === "reject") setConfirmingReject(false);
      // The sidebar badge caches the pending count per pathname — tell it to refetch.
      window.dispatchEvent(new CustomEvent("pending-changed"));
      router.refresh();
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" disabled={busy} onClick={() => act("approve")}>
        ✅ Approve
      </button>
      <button type="button" className="danger-button" disabled={busy} onClick={() => setConfirmingReject(true)}>
        ❌ Reject
      </button>
      {note && (
        <span role="status" style={{ fontSize: ".8rem", color: "#8a5b00" }}>
          {note}
        </span>
      )}
      <Modal
        open={confirmingReject}
        title={uploadId ? "Reject this upload?" : "Reject and delete this report?"}
        body={uploadId ? "Only this pending upload will be rejected. Approved ledger data stays unchanged." : "All extracted lines for this day will be deleted. Staff must re-send the photo to correct it."}
        confirmLabel="Reject & delete"
        danger
        busy={busy}
        onConfirm={() => act("reject")}
        onCancel={() => {
          if (!busy) setConfirmingReject(false);
        }}
      />
    </div>
  );
}
