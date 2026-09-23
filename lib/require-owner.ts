import { NextRequest, NextResponse } from "next/server";
import { auth } from "./auth";

/**
 * Business-owner world: any signed-in, non-banned, non-admin user.
 * Admins are redirected to /admin/users (pages) or 403 (APIs) —
 * the admin portal is Users-only and never sees dashboard data.
 */
export async function requireOwner(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  const user = session.user as { role?: string; banned?: boolean | null };
  if (user.banned) return { error: NextResponse.json({ message: "Forbidden" }, { status: 403 }) };
  if (user.role === "admin") return { error: NextResponse.json({ message: "Forbidden" }, { status: 403 }) };
  return { session };
}
