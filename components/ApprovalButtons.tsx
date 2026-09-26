"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ApprovalButtons({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: "approve" | "reject") {
    setBusy(true);
    try {
      const response = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, action }),
      });
      if (!response.ok) throw new Error("Action failed.");
      // The sidebar badge caches the pending count per pathname — tell it to refetch.
      window.dispatchEvent(new CustomEvent("pending-changed"));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button type="button" disabled={busy} onClick={() => act("approve")}>
        ✅ Approve
      </button>
      <button type="button" className="danger-button" disabled={busy} onClick={() => act("reject")}>
        ❌ Reject
      </button>
    </div>
  );
}
