import { legacyPendingWhere, pendingReviewWhere } from "../../../lib/pending-uploads";
import { PendingUploadPreview } from "../../../components/PendingUploadPreview";
import type { ExtractedPayload } from "../../../lib/persist-ledger";
import { ownerPageOrRedirect } from "../../../lib/owner-page";
import { prisma } from "../../../lib/prisma";
import { PageHeader, StatusPill } from "../../../components/layout";
import { ApprovalButtons } from "../../../components/ApprovalButtons";
import { ReportEditor } from "../../../components/ReportEditor";
import { reportRevision } from "../../../lib/report-revision";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  await ownerPageOrRedirect();

  const reports = await prisma.dailyReport.findMany({
    where: legacyPendingWhere,
    orderBy: { date: "asc" },
    include: {
      revenueLines: true,
      expenseLines: true,
      maintenanceLines: true,
      fuelEntries: true,
      brickEntries: true,
    },
  });

  const uploads = await prisma.pendingUpload.findMany({ where: await pendingReviewWhere(), include: { report: { select: { date: true } } }, orderBy: { createdAt: "asc" } });

  return (
    <>
      <PageHeader
        title="Approvals"
        sub={`${reports.length + uploads.length} review item(s) awaiting review`}
      />

      {reports.length === 0 && uploads.length === 0 ? (
        <section className="card pad">
          <p className="muted">✅ All clear - nothing pending.</p>
        </section>
      ) : (
        <div className="queue">
          {reports.map((report) => {
            const dateKey = report.date.toISOString().slice(0, 10);
            return (
              <section key={report.id} className="card queue-item" style={{ alignItems: "stretch" }}>
                <div className="grow">
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <b>{dateKey}</b>
                    <StatusPill status={report.status} />
                  </div>
                  <ReportEditor
                    dateKey={dateKey}
                    initial={{
                      revision: reportRevision(report),
                      status: report.status,
                      revenueLines: report.revenueLines.map((row) => ({ id: row.id, method: row.method, amount: Number(row.amount) })),
                      expenseLines: report.expenseLines.map((row) => ({
                        id: row.id,
                        category: row.category,
                        name: row.name,
                        amount: Number(row.amount),
                      })),
                      maintenanceLines: report.maintenanceLines.map((row) => ({
                        id: row.id,
                        vehicle: row.vehicle,
                        amount: Number(row.amount),
                        part: row.part,
                      })),
                      fuelEntries: report.fuelEntries.map((row) => ({
                        id: row.id,
                        particular: row.particular,
                        date: row.date ? row.date.toISOString().slice(0, 10) : null,
                        inGal: row.inGal === null ? null : Number(row.inGal),
                        outGal: row.outGal === null ? null : Number(row.outGal),
                        balanceGal: row.balanceGal === null ? null : Number(row.balanceGal),
                        balanceOk: row.balanceOk,
                      })),
                      brickEntries: report.brickEntries.map((row) => ({
                        id: row.id,
                        item: row.item,
                        date: row.date ? row.date.toISOString().slice(0, 10) : null,
                        qty: row.qty === null ? null : Number(row.qty),
                        unitPrice: row.unitPrice === null ? null : Number(row.unitPrice),
                        amount: row.amount === null ? null : Number(row.amount),
                      })),
                    }}
                  />
                </div>
                <ApprovalButtons reportId={report.id} />
              </section>
            );
          })}
        </div>
      )}
      <div className="queue">{uploads.map(upload => <PendingUploadPreview key={upload.id} id={upload.id} reportId={upload.reportId} date={upload.report.date.toISOString().slice(0, 10)} mode={upload.mode} payload={upload.payload as unknown as ExtractedPayload} />)}</div>
    </>
  );
}
