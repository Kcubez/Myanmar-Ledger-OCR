import { ownerPageOrRedirect } from "../../lib/owner-page";
import { prisma } from "../../lib/prisma";
import { AppShell, PageHeader, StatusPill } from "../../components/layout";
import { ApprovalButtons } from "../../components/ApprovalButtons";
import { ReportEditor } from "../../components/ReportEditor";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  await ownerPageOrRedirect();

  const reports = await prisma.dailyReport.findMany({
    where: { status: { in: ["PENDING", "NEEDS_REVIEW"] } },
    orderBy: { date: "desc" },
    include: {
      revenueLines: true,
      expenseLines: true,
      maintenanceLines: true,
      fuelEntries: true,
      brickEntries: true,
    },
  });

  return (
    <AppShell>
      <PageHeader
        eyebrow="LEDGER DASHBOARD"
        title="Approvals"
        sub={`${reports.length} report(s) awaiting review — oldest first`}
      />

      {reports.length === 0 ? (
        <section className="card pad">
          <p className="muted">✅ All clear — nothing pending.</p>
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
    </AppShell>
  );
}
