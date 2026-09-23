import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";
import { requireAdmin } from "../../../../lib/require-admin";

export const dynamic = "force-dynamic";

// GET /api/admin/users — list users with bot + sender counts.
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      banned: true,
      createdAt: true,
      botSettings: { select: { isActive: true, updatedAt: true } },
      _count: { select: { telegramSenders: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ users });
}

// POST /api/admin/users — create a staff/admin web account (stays signed in as admin).
export async function POST(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = (await req.json()) as { name?: string; email?: string; password?: string; role?: string };
  if (!body.name || !body.email || !body.password) {
    return NextResponse.json({ message: "Name, email, and password are required." }, { status: 400 });
  }
  if (body.role !== undefined && body.role !== "user" && body.role !== "admin") {
    return NextResponse.json({ message: "Role must be user or admin." }, { status: 400 });
  }
  try {
    const created = await auth.api.createUser({
      headers: req.headers,
      body: {
        email: body.email,
        password: body.password,
        name: body.name,
        role: (body.role ?? "user") as "user" | "admin",
      },
    });
    return NextResponse.json({ user: created });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to create user." },
      { status: 400 },
    );
  }
}

// PATCH /api/admin/users — { id, role?, banned? }. Admins cannot demote/ban themselves.
export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin(req);
  if (guard.error) return guard.error;

  const body = (await req.json()) as { id?: string; role?: string; banned?: boolean };
  if (!body.id) return NextResponse.json({ message: "Missing id." }, { status: 400 });
  if (body.id === guard.session.user.id && (body.role === "user" || body.banned === true)) {
    return NextResponse.json({ message: "You cannot demote or ban yourself." }, { status: 400 });
  }
  if (body.role !== undefined && body.role !== "user" && body.role !== "admin") {
    return NextResponse.json({ message: "Role must be user or admin." }, { status: 400 });
  }
  const user = await prisma.user.update({
    where: { id: body.id },
    data: {
      ...(body.role !== undefined ? { role: body.role } : {}),
      ...(body.banned !== undefined ? { banned: body.banned } : {}),
    },
    select: { id: true, name: true, email: true, role: true, banned: true },
  });
  return NextResponse.json({ user });
}
