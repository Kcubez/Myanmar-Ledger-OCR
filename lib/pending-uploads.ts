import { prisma } from "./prisma";
import { persistLines, type ExtractedPayload } from "./persist-ledger";
import { isLedgerType } from "./extract";

// Old staged uploads also used PENDING. The submitter message is the explicit
// submit marker, so those uploads cannot bypass Submit for review either.
export async function pendingReviewWhere() {
  const messages = await prisma.telegramMessage.findMany({ where: { status: "approval_requested" }, select: { id: true } });
  return { status: "PENDING", id: { in: messages.map(message => message.id) } };
}

export const legacyPendingWhere = {
  status: { in: ["PENDING", "NEEDS_REVIEW"] as ("PENDING" | "NEEDS_REVIEW")[] },
  OR: [{ revenueLines: { some: {} } }, { expenseLines: { some: {} } }, { maintenanceLines: { some: {} } }, { fuelEntries: { some: {} } }, { brickEntries: { some: {} } }],
};

export async function resolveUpload(id: string, approved: boolean) {
  return prisma.$transaction(async tx => {
    const upload = await tx.pendingUpload.findUnique({ where: { id }, include: { report: true } });
    if (!upload || upload.status !== "PENDING") throw new Error("Upload already reviewed or not found.");
    const message = await tx.telegramMessage.findUnique({ where: { id } });
    if (message?.status !== "approval_requested") throw new Error("The sender has not submitted this upload for review.");
    if (!isLedgerType(upload.mode)) throw new Error("Invalid ledger type.");
    if (approved) {
      const legacy = await tx.dailyReport.count({ where: { id: upload.reportId, ...legacyPendingWhere } });
      if (legacy) throw new Error("Review the existing pending report for this date first.");
      if (["revenue", "expense", "maintenance"].includes(upload.mode)) {
        const newer = await tx.pendingUpload.count({ where: { reportId: upload.reportId, mode: upload.mode, status: "CONFIRMED", createdAt: { gt: upload.createdAt } } });
        if (newer) throw new Error("A newer upload is already approved. Reject this older version.");
      }
      if (upload.mode === "inventory") {
        const payload = upload.payload as unknown as ExtractedPayload;
        if (payload.sheetKind !== "materials" && payload.sheetKind !== "fuel") throw new Error("Invalid inventory sheet.");
        const newer = await tx.pendingUpload.count({ where: { reportId: upload.reportId, mode: "inventory", status: "CONFIRMED", createdAt: { gt: upload.createdAt }, payload: { path: ["sheetKind"], equals: payload.sheetKind } } });
        if (newer) throw new Error("A newer inventory sheet is already approved. Reject this older version.");
      }
      await persistLines(tx, upload.reportId, upload.id, upload.mode, upload.payload as unknown as ExtractedPayload, upload.effectiveDate);
      await tx.dailyReport.update({ where: { id: upload.reportId }, data: { status: "CONFIRMED" } });
    }
    await tx.pendingUpload.update({ where: { id }, data: { status: approved ? "CONFIRMED" : "REJECTED", ...(approved ? { approvedAt: new Date() } : {}) } });
    await tx.telegramMessage.update({ where: { id }, data: { status: approved ? "confirmed" : "rejected" } });
    return upload;
  }, { isolationLevel: "Serializable", timeout: 30000 });
}
