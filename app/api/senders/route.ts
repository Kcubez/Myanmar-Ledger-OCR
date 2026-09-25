import { prisma } from "../../../lib/prisma";
import { requireOwner } from "../../../lib/require-owner";
import { LEDGER_TYPES } from "../../../lib/extract";
import { NextRequest, NextResponse } from "next/server";

// GET /api/senders — list own Telegram senders (owner-scoped).
export async function GET(req: NextRequest) {
  const guard = await requireOwner(req);
  if (guard.error) return guard.error;

  const senders = await prisma.telegramSender.findMany({
    where: { userId: guard.session.user.id },
    orderBy: { lastMessageAt: "desc" },
  });

  return NextResponse.json({
    senders: senders.map((s) => ({
      ...s,
      telegramUserId: s.telegramUserId ? s.telegramUserId.toString() : null,
    })),
  });
}

// PATCH /api/senders — toggle authorization/scopes (own senders only).
// Body: { id, isAuthorized?, isDataApprover?, allowedLedgers? }
export async function PATCH(req: NextRequest) {
  const guard = await requireOwner(req);
  if (guard.error) return guard.error;

  const body = (await req.json()) as {
    id?: string;
    isAuthorized?: boolean;
    isDataApprover?: boolean;
    allowedLedgers?: string[];
  };
  if (!body.id) return NextResponse.json({ message: "Missing id" }, { status: 400 });

  const existing = await prisma.telegramSender.findFirst({
    where: { id: body.id, userId: guard.session.user.id },
  });
  if (!existing) return NextResponse.json({ message: "Not found." }, { status: 404 });

  if (body.allowedLedgers !== undefined) {
    const invalid = body.allowedLedgers.filter(
      (scope): scope is string => !(LEDGER_TYPES as readonly string[]).includes(scope),
    );
    if (invalid.length) {
      return NextResponse.json(
        { message: `Invalid ledger scopes: ${invalid.join(", ")}` },
        { status: 400 },
      );
    }
  }

  const sender = await prisma.telegramSender.update({
    where: { id: body.id },
    data: {
      ...(body.isAuthorized !== undefined ? { isAuthorized: body.isAuthorized } : {}),
      ...(body.isDataApprover !== undefined ? { isDataApprover: body.isDataApprover } : {}),
      ...(body.allowedLedgers !== undefined ? { allowedLedgers: body.allowedLedgers } : {}),
    },
  });

  return NextResponse.json({
    sender: { ...sender, telegramUserId: sender.telegramUserId ? sender.telegramUserId.toString() : null },
  });
}

// DELETE /api/senders — permanently remove a sender (own senders only).
// Body: { id }. A deleted person who messages the bot again gets a fresh
// unverified row and must /link + OTP again.
export async function DELETE(req: NextRequest) {
  const guard = await requireOwner(req);
  if (guard.error) return guard.error;

  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ message: "Missing id" }, { status: 400 });

  const existing = await prisma.telegramSender.findFirst({
    where: { id: body.id, userId: guard.session.user.id },
  });
  if (!existing) return NextResponse.json({ message: "Not found." }, { status: 404 });

  await prisma.telegramSender.delete({ where: { id: body.id } });
  return NextResponse.json({ ok: true });
}
