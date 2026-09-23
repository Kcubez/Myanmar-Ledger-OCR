import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "../../../lib/auth";
import { AuthLayout } from "../../../components/AuthLayout";
import { LoginForm } from "../../../components/LoginForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin Sign in — Ledger Dashboard",
};

export default async function AdminLoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session && (session.user as { role?: string }).role === "admin") redirect("/admin/users");

  return (
    <AuthLayout
      eyebrow="SECURE ADMIN PORTAL"
      title="Admin sign in"
      sub="Admins only. Staff use the regular sign-in."
    >
      <Suspense>
        <LoginForm requiredRole="admin" />
      </Suspense>
    </AuthLayout>
  );
}
