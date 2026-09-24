import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireOwner } from "../../../../lib/require-owner";
import { LEDGER_TYPES } from "../../../../lib/extract";

export const dynamic = "force-dynamic";

// POST /api/settings/senders — pre-register a staff sender (admin only).
// Body: { email, allowedLedgers: LedgerType[], isDataApprover? }
// The row is claimed at /link OTP time (matched by email, same tenant).
export async function POST(req: NextRequest) {
  const guard = await requireOwner(req);
  if (guard.error) return guard.error;

  const body = (await req.json()) as { email?: string; allowedLedgers?: string[]; isDataApprover?: boolean };
  const email = (body.email ?? "").trim().toLowerCase();
  if (!/.+@.+\..+/.test(email)) {
    return NextResponse.json({ message: "Valid email required." }, { status: 400 });
  }
  const scopes = Array.isArray(body.allowedLedgers) ? body.allowedLedgers : [];
  const invalid = scopes.filter((scope) => !(LEDGER_TYPES as readonly string[]).includes(scope));
  if (invalid.length) {
    return NextResponse.json({ message: `Invalid ledger scopes: ${invalid.join(", ")}` }, { status: 400 });
  }

  const existing = await prisma.telegramSender.findFirst({
    where: { email, userId: guard.session.user.id },
  });
  const sender = existing
    ? await prisma.telegramSender.update({
        where: { id: existing.id },
        data: { allowedLedgers: scopes, isDataApprover: body.isDataApprover ?? false },
      })
    : await prisma.telegramSender.create({
        data: {
          email,
          displayName: email,
          allowedLedgers: scopes,
          isDataApprover: body.isDataApprover ?? false,
          isAuthorized: true,
          userId: guard.session.user.id,
        },
      });

  return NextResponse.json({
    sender: { ...sender, telegramUserId: sender.telegramUserId ? sender.telegramUserId.toString() : null },
  });
}
