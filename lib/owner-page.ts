import { cache } from "react";
import { retrySessionLookup } from "./session-retry";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

/**
 * Page guard for the business-owner world (server components).
 * Unauthenticated → /login; banned → /login; admin → /admin/users.
 */
export const ownerPageOrRedirect = cache(async () => {
  const requestHeaders = await headers();
  const session = await retrySessionLookup(() => auth.api.getSession({ headers: requestHeaders }));
  if (!session) redirect("/login");
  const user = session.user as { role?: string; banned?: boolean | null };
  if (user.role === "admin") redirect("/admin/users");
  if (user.banned) redirect("/login");
  return session;
});
