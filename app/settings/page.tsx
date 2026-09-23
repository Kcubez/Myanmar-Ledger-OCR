import { ownerPageOrRedirect } from "../../lib/owner-page";
import { AppShell, PageHeader } from "../../components/layout";
import { SettingsManager } from "../../components/SettingsManager";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Settings — Ledger Dashboard",
};

export default async function SettingsPage() {
  await ownerPageOrRedirect();

  return (
    <AppShell>
      <PageHeader
        eyebrow="ADMIN"
        title="Settings"
        sub="Bot token, Gemini key, and Telegram sender access — replaces environment config"
      />
      <SettingsManager />
    </AppShell>
  );
}
