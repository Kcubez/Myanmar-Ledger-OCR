"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ApprovalButtons({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function act(action: "approve" | "reject") {
    setBusy(true);
    setNote("");
    try {
      const response = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, action }),
      });
      if (!response.ok) throw new Error("Action failed.");
      const data = (await response.json()) as { telegramUpdated?: boolean };
      if (data.telegramUpdated === false) {
        setNote("Saved, but Telegram update failed — check bot status.");
      }
      // The sidebar badge caches the pending count per pathname — tell it to refetch.
      window.dispatchEvent(new CustomEvent("pending-changed"));
      router.refresh();
    } catch {
      setNote("Action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" disabled={busy} onClick={() => act("approve")}>
        ✅ Approve
      </button>
      <button type="button" className="danger-button" disabled={busy} onClick={() => act("reject")}>
        ❌ Reject
      </button>
      {note && (
        <span role="status" style={{ fontSize: ".8rem", color: "#8a5b00" }}>
          {note}
        </span>
      )}
    </div>
  );
}
