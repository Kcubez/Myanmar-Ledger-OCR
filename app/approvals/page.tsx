import { ownerPageOrRedirect } from "../../lib/owner-page";
import { prisma } from "../../lib/prisma";
import { AppShell, PageHeader, StatusPill } from "../../components/layout";
import { ApprovalButtons } from "../../components/ApprovalButtons";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  await ownerPageOrRedirect();

  const reports = await prisma.dailyReport.findMany({
    where: { status: { in: ["PENDING", "NEEDS_REVIEW"] } },
    orderBy: { date: "desc" },
    include: {
      _count: {
        select: { revenueLines: true, expenseLines: true, maintenanceLines: true, fuelEntries: true, brickEntries: true, images: true },
      },
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
          {reports.map((report) => (
            <section key={report.id} className="card queue-item">
              <div className="grow">
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <b>{report.date.toISOString().slice(0, 10)}</b>
                  <StatusPill status={report.status} />
                </div>
                <p className="muted" style={{ margin: "4px 0" }}>
                  {report._count.images} photo(s) · rev {Number(report.totalRevenue).toLocaleString()} / exp{" "}
                  {Number(report.totalExpense).toLocaleString()} · {report._count.fuelEntries + report._count.brickEntries}{" "}
                  fuel/brick rows
                </p>
                <a href={`/reports/${report.date.toISOString().slice(0, 10)}`}>Open detail →</a>
              </div>
              <ApprovalButtons reportId={report.id} />
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}
