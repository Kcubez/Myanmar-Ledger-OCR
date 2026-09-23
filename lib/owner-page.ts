import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

/**
 * Page guard for the business-owner world (server components).
 * Unauthenticated → /login; banned → /login; admin → /admin/users.
 */
export async function ownerPageOrRedirect() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const user = session.user as { role?: string; banned?: boolean | null };
  if (user.role === "admin") redirect("/admin/users");
  if (user.banned) redirect("/login");
  return session;
}
