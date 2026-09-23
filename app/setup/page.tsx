import { prisma } from "../../lib/prisma";
import { redirect } from "next/navigation";
import { AuthLayout } from "../../components/AuthLayout";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Initial Setup — Ledger Dashboard",
};

export default async function SetupPage() {
  // Strictly for first deployment: bounce to login once any user exists.
  const userCount = await prisma.user.count();

  if (userCount > 0) {
    redirect("/login");
  }

  return (
    <AuthLayout
      eyebrow="SETUP · STEP 1 OF 1"
      title="Create admin"
      sub="First account unlocks the system. This page locks permanently afterwards."
    >
      <SetupForm />
    </AuthLayout>
  );
}
