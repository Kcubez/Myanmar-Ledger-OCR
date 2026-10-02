import { AppShell } from "../../components/layout";
import { ownerPageOrRedirect } from "../../lib/owner-page";

export default async function LedgerLayout({ children }: { children: React.ReactNode }) {
  // The guard only returns for authenticated, non-admin owners.
  // Keep the shell mounted across ledger routes; pages retain their own guards.
  const session = await ownerPageOrRedirect();
  return <AppShell role="user" account={{ name: session.user.name, email: session.user.email }}>{children}</AppShell>;
}
