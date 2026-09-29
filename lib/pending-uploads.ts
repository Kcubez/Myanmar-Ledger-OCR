import { prisma } from "./prisma";
import { persistLines, type ExtractedPayload } from "./persist-ledger";
import { isLedgerType } from "./extract";

export const legacyPendingWhere = {
  status: { in: ["PENDING", "NEEDS_REVIEW"] as ("PENDING" | "NEEDS_REVIEW")[] },
  OR: [{ revenueLines: { some: {} } }, { expenseLines: { some: {} } }, { maintenanceLines: { some: {} } }, { fuelEntries: { some: {} } }, { brickEntries: { some: {} } }],
};

export async function resolveUpload(id: string, approved: boolean) {
  return prisma.$transaction(async tx => {
    const upload = await tx.pendingUpload.findUnique({ where: { id }, include: { report: true } });
    if (!upload || upload.status !== "PENDING") throw new Error("Upload already reviewed or not found.");
    if (!isLedgerType(upload.mode)) throw new Error("Invalid ledger type.");
    if (approved) {
      const legacy = await tx.dailyReport.count({ where: { id: upload.reportId, ...legacyPendingWhere } });
      if (legacy) throw new Error("Review the existing pending report for this date first.");
      if (["revenue", "expense", "maintenance"].includes(upload.mode)) {
        const newer = await tx.pendingUpload.count({ where: { reportId: upload.reportId, mode: upload.mode, status: "CONFIRMED", createdAt: { gt: upload.createdAt } } });
        if (newer) throw new Error("A newer upload is already approved. Reject this older version.");
      }
      await persistLines(tx, upload.reportId, upload.mode, upload.payload as unknown as ExtractedPayload, upload.report.date);
      await tx.dailyReport.update({ where: { id: upload.reportId }, data: { status: "CONFIRMED" } });
    }
    await tx.pendingUpload.update({ where: { id }, data: { status: approved ? "CONFIRMED" : "REJECTED" } });
    await tx.telegramMessage.update({ where: { id }, data: { status: approved ? "confirmed" : "rejected" } });
    return upload;
  }, { isolationLevel: "Serializable", timeout: 30000 });
}
