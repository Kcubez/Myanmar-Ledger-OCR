/**
 * Telegram sender identity helpers. Database access only —
 * no Telegram network calls.
 */
import { prisma } from "../prisma";
import { Prisma } from "../../generated/prisma/client";

export function displayNameFromTelegramUser(from: { first_name?: string; last_name?: string }): string {
  return [from.first_name, from.last_name].filter(Boolean).join(" ");
}

export function isPrismaUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function upsertSender(
  from: { id: number; first_name?: string; last_name?: string; username?: string },
  ownerUserId: string | null | undefined,
) {
  const displayName = displayNameFromTelegramUser(from);

  const existing = await prisma.telegramSender.findFirst({
    where: { telegramUserId: BigInt(from.id), userId: ownerUserId || null },
  });

  if (!existing) {
    return prisma.telegramSender.create({
      data: {
        telegramUserId: BigInt(from.id),
        firstName: from.first_name || "Unknown",
        lastName: from.last_name || null,
        username: from.username || null,
        displayName: displayName || "Unknown",
        messageCount: 0,
        lastMessageAt: null,
        activeReportType: "none",
        userId: ownerUserId || null,
      },
    });
  }

  return prisma.telegramSender.update({
    where: { id: existing.id },
    data: {
      firstName: from.first_name || "Unknown",
      lastName: from.last_name || null,
      username: from.username || null,
      displayName: displayName || "Unknown",
      ...(ownerUserId ? { userId: ownerUserId } : {}),
    },
  });
}

/**
 * Gate every update through this BEFORE any Gemini/file work.
 * Returns true only for email-OTP-verified, admin-authorized senders.
 */
export function isSenderAuthorized(sender: { isVerified: boolean; isAuthorized: boolean }): boolean {
  return sender.isVerified && sender.isAuthorized;
}

/** Owner tenant for all senders: the first admin account. */
export async function getOwnerUserId(): Promise<string | null> {
  const admin = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } });
  return admin?.id ?? null;
}
