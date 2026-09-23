import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { AuthLayout } from "../../components/AuthLayout";
import { LoginForm } from "../../components/LoginForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in — Ledger Dashboard",
};

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/dashboard");

  const userCount = await prisma.user.count().catch(() => 1);

  return (
    <AuthLayout
      eyebrow="LEDGER DASHBOARD"
      title="Sign in"
      sub="Business owner sign-in. Accounts are created by the admin."
    >
      <Suspense>
        <LoginForm requiredRole="user" />
      </Suspense>
    </AuthLayout>
  );
}
