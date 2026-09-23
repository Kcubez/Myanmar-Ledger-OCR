import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../../../lib/auth";
import { AppShell, PageHeader } from "../../../components/layout";
import { UsersManager } from "../../../components/UsersManager";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Users — Ledger Admin",
};

export default async function AdminUsersPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/admin/login");
  if ((session.user as { role?: string }).role !== "admin") redirect("/dashboard");

  return (
    <AppShell>
      <PageHeader eyebrow="ADMIN" title="Users" sub="Staff web accounts — Telegram linking happens in-bot via /link + OTP" />
      <UsersManager currentUserId={session.user.id} />
    </AppShell>
  );
}
