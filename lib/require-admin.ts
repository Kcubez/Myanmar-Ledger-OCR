import { NextRequest, NextResponse } from "next/server";
import { auth } from "./auth";

/** Session + admin role, or a 401/403 response. */
export async function requireAdmin(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  if ((session.user as { role?: string }).role !== "admin") {
    return { error: NextResponse.json({ message: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}
