import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "../../../../lib/prisma";
import { requireOwner } from "../../../../lib/require-owner";

export const dynamic = "force-dynamic";

const DEFAULT_MODEL = "gemini-3.5-flash";

function maskSecret(value: string | null | undefined): string {
  if (!value) return "";
  return value.length <= 4 ? "••••" : `••••••••${value.slice(-4)}`;
}

function unchanged(value: string | undefined): boolean {
  return value !== undefined && value.includes("•");
}

// GET /api/settings/bot — masked bot config + active flag (own row only).
export async function GET(req: NextRequest) {
  const guard = await requireOwner(req);
  if (guard.error) return guard.error;

  const settings = await prisma.botSettings.findUnique({ where: { userId: guard.session.user.id } });
  return NextResponse.json({
    settings: {
      botToken: maskSecret(settings?.botToken),
      geminiApiKey: maskSecret(settings?.geminiApiKey),
      geminiModel: settings?.geminiModel ?? DEFAULT_MODEL,
      isActive: settings?.isActive ?? false,
      updatedAt: settings?.updatedAt ?? null,
      usingEnvFallback: !settings?.botToken,
    },
  });
}

// PUT /api/settings/bot — save token/key, auto-register webhook.
// Body: { botToken?, geminiApiKey?, geminiModel? } — "•" = unchanged, "" = clear.
export async function PUT(req: NextRequest) {
  const guard = await requireOwner(req);
  if (guard.error) return guard.error;
  const ownerId = guard.session.user.id;

  const body = (await req.json()) as { botToken?: string; geminiApiKey?: string; geminiModel?: string };
  const tokenToSave = body.botToken !== undefined && !unchanged(body.botToken) ? body.botToken.trim() || null : undefined;
  const keyToSave = body.geminiApiKey !== undefined && !unchanged(body.geminiApiKey) ? body.geminiApiKey.trim() || null : undefined;
  const modelToSave = typeof body.geminiModel === "string" && body.geminiModel.trim() ? body.geminiModel.trim() : undefined;

  if (tokenToSave) {
    const clash = await prisma.botSettings.findFirst({
      where: { botToken: tokenToSave, userId: { not: ownerId }, isActive: true },
    });
    if (clash) {
      return NextResponse.json({ message: "This bot token is already used by another workspace." }, { status: 409 });
    }
  }

  const existing = await prisma.botSettings.findFirst({ where: { userId: ownerId } });
  const effectiveToken = tokenToSave ?? existing?.botToken ?? null;

  // Auto-register webhook when we have a token and (new token or no secret yet).
  let webhookSecret = existing?.webhookSecret ?? null;
  let webhookRegistered = false;
  let webhookUrl: string | null = null;
  if (effectiveToken && (tokenToSave || !webhookSecret)) {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    if (appUrl) {
      webhookSecret = crypto.randomBytes(32).toString("hex");
      webhookUrl = `${appUrl}/api/telegram/webhook`;
      const response = await fetch(`https://api.telegram.org/bot${effectiveToken}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl, secret_token: webhookSecret }),
      }).catch(() => null);
      webhookRegistered = response !== null && response.ok && ((await response.json().catch(() => null)) as { ok?: boolean } | null)?.ok === true;
      if (!webhookRegistered) webhookSecret = existing?.webhookSecret ?? null;
    }
  }

  const settings = await prisma.botSettings.upsert({
    where: { userId: ownerId },
    create: {
      userId: ownerId,
      botToken: tokenToSave ?? null,
      webhookSecret,
      geminiApiKey: keyToSave ?? null,
      geminiModel: modelToSave ?? DEFAULT_MODEL,
      isActive: !!effectiveToken,
    },
    update: {
      ...(tokenToSave !== undefined ? { botToken: tokenToSave } : {}),
      ...(webhookSecret !== existing?.webhookSecret ? { webhookSecret } : {}),
      ...(keyToSave !== undefined ? { geminiApiKey: keyToSave } : {}),
      ...(modelToSave !== undefined ? { geminiModel: modelToSave } : {}),
      ...(tokenToSave !== undefined ? { isActive: !!effectiveToken } : {}),
    },
  });

  return NextResponse.json({
    settings: {
      botToken: maskSecret(settings.botToken),
      geminiApiKey: maskSecret(settings.geminiApiKey),
      geminiModel: settings.geminiModel,
      isActive: settings.isActive,
      updatedAt: settings.updatedAt,
      usingEnvFallback: false,
    },
    webhookRegistered,
    webhookUrl,
    ...(effectiveToken && !process.env.NEXT_PUBLIC_APP_URL
      ? { warning: "Saved, but NEXT_PUBLIC_APP_URL is unset so the webhook was not registered." }
      : {}),
  });
}
