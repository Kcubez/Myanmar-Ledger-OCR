import { notFound } from "next/navigation";
import Image from "next/image";
import { ownerPageOrRedirect } from "../../../lib/owner-page";
import { prisma } from "../../../lib/prisma";
import { signImage } from "../../../lib/supabase";
import { AppShell, PageHeader, StatusPill } from "../../../components/layout";
import { ReportEditor } from "../../../components/ReportEditor";

export const dynamic = "force-dynamic";

export default async function ReportDetailPage({ params }: { params: Promise<{ date: string }> }) {
  await ownerPageOrRedirect();
  const { date: dateParam } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) notFound();

  const report = await prisma.dailyReport.findUnique({
    where: { date: new Date(`${dateParam}T00:00:00.000Z`) },
    include: {
      revenueLines: true,
      expenseLines: true,
      maintenanceLines: true,
      fuelEntries: true,
      brickEntries: true,
      images: true,
    },
  });
  if (!report) notFound();

  const images = await Promise.all(
    report.images.map(async (image) => ({
      ledgerType: image.ledgerType,
      // Thumbnails-only policy: new rows carry thumbnailPath; storagePath is
      // the legacy full-size fallback for rows saved before the cutover.
      url: image.thumbnailPath
        ? await signImage(image.thumbnailPath)
        : image.storagePath
          ? await signImage(image.storagePath)
          : null,
      rawText: image.rawText,
    })),
  );

  return (
    <AppShell>
      <PageHeader
        eyebrow="DAILY REPORT"
        title={dateParam}
        sub={`Revenue ${Number(report.totalRevenue).toLocaleString()} Ks · Expense ${Number(
          report.totalExpense,
        ).toLocaleString()} Ks`}
        actions={
          <>
            <StatusPill status={report.status} />
            <a href="/approvals" style={{ fontSize: ".85rem" }}>
              ← Queue
            </a>
          </>
        }
      />

      <div className="detail-2">
        <div className="sticky-col" style={{ display: "grid", gap: 12 }}>
          {images.length === 0 && (
            <section className="card pad">
              <p className="muted">No source photos for this report.</p>
            </section>
          )}
          {images.map((image, i) => (
            <section key={i} className="card pad">
              <h2>{image.ledgerType}</h2>
              {image.url ? (
                <Image
                  unoptimized
                  src={image.url}
                  width={600}
                  height={800}
                  alt={`${image.ledgerType} source`}
                  style={{ width: "100%", height: "auto", borderRadius: 8 }}
                />
              ) : (
                <p className="muted">Image unavailable.</p>
              )}
              {image.rawText && (
                <details style={{ marginTop: 8 }}>
                  <summary className="muted">Raw extracted text</summary>
                  <p className="muted" style={{ whiteSpace: "pre-wrap" }}>
                    {image.rawText}
                  </p>
                </details>
              )}
            </section>
          ))}
        </div>

        <section className="card pad">
          <ReportEditor
          dateKey={dateParam}
          initial={{
            status: report.status,
            revenueLines: report.revenueLines.map((row) => ({ method: row.method, amount: Number(row.amount) })),
            expenseLines: report.expenseLines.map((row) => ({
              category: row.category,
              name: row.name,
              role: row.role,
              amount: Number(row.amount),
            })),
            maintenanceLines: report.maintenanceLines.map((row) => ({
              vehicle: row.vehicle,
              amount: Number(row.amount),
              part: row.part,
              vendor: row.vendor,
            })),
            fuelEntries: report.fuelEntries.map((row) => ({
              vehicle: row.vehicle,
              particular: row.particular,
              inGal: row.inGal === null ? null : Number(row.inGal),
              outGal: row.outGal === null ? null : Number(row.outGal),
              balanceGal: row.balanceGal === null ? null : Number(row.balanceGal),
              balanceOk: row.balanceOk,
            })),
            brickEntries: report.brickEntries.map((row) => ({
              item: row.item,
              qty: row.qty === null ? null : Number(row.qty),
              unitPrice: row.unitPrice === null ? null : Number(row.unitPrice),
              amount: row.amount === null ? null : Number(row.amount),
            })),
          }}
        />
        </section>
      </div>
    </AppShell>
  );
}
