import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { requireOwner } from "../../../lib/require-owner";
import { serializeReport } from "../../../lib/reports";

export const dynamic = "force-dynamic";

// GET /api/reports?limit=60 — recent daily reports with totals + line counts.
export async function GET(req: NextRequest) {
  const { error } = await requireOwner(req);
  if (error) return error;

  const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get("limit")) || 60, 1), 365);
  const reports = await prisma.dailyReport.findMany({
    orderBy: { date: "desc" },
    take: limit,
    include: {
      _count: {
        select: { revenueLines: true, expenseLines: true, maintenanceLines: true, fuelEntries: true, brickEntries: true, images: true },
      },
    },
  });
  return NextResponse.json({ reports: reports.map(serializeReport) });
}
