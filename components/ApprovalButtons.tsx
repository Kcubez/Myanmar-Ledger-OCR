"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { useToast } from "./ToastProvider";

export function ApprovalButtons({ reportId, uploadId, disabled = false }: { reportId: string; uploadId?: string; disabled?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmingReject, setConfirmingReject] = useState(false);

  async function act(action: "approve" | "reject") {
    setBusy(true);
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
        toast.warn("Saved, but Telegram update failed — check bot status.");
      }
      if (action === "reject") setConfirmingReject(false);
      // The sidebar badge caches the pending count per pathname — tell it to refetch.
      window.dispatchEvent(new CustomEvent("pending-changed"));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="approval-actions">
      <button type="button" className="approve-button" disabled={busy || disabled} onClick={() => act("approve")}>
        <span aria-hidden="true">✓</span> Approve
      </button>
      <button type="button" className="reject-button" disabled={busy || disabled} onClick={() => setConfirmingReject(true)} aria-label="Reject pending upload" title="Reject pending upload">
        <span aria-hidden="true">×</span><span>Reject</span>
      </button>
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
