"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "../lib/auth-client";

const LINKS = [
  { href: "/dashboard", label: "Overview", ico: "📊" },
  { href: "/fuel", label: "Fuel", ico: "⛽" },
  { href: "/brick", label: "Brick", ico: "🧱" },
  { href: "/maintenance", label: "Maintenance", ico: "🔧" },
  { href: "/approvals", label: "Approvals", ico: "✅" },
  { href: "/settings", label: "Settings", ico: "⚙️" },
];

const ADMIN_LINKS = [{ href: "/admin/users", label: "Users", ico: "👥" }];

function NavLinks({
  links,
  pathname,
  pending,
  onNavigate,
}: {
  links: typeof LINKS;
  pathname: string;
  pending: number | null;
  onNavigate: () => void;
}) {
  return (
    <>
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`side-link${active ? " active" : ""}`}
            onClick={onNavigate}
          >
            <span aria-hidden>{link.ico}</span> {link.label}
            {link.href === "/approvals" && !!pending && <span className="badge">{pending}</span>}
          </Link>
        );
      })}
    </>
  );
}

export function StatusPill({ status }: { status: string }) {
  const kind = status === "CONFIRMED" ? "confirmed" : status === "NEEDS_REVIEW" ? "review" : "pending";
  return <span className={`pill ${kind}`}>{status.replace("_", " ")}</span>;
}

export function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <b style={tone === "good" ? { color: "#176637" } : tone === "bad" ? { color: "#983a3a" } : undefined}>
        {value}
      </b>
      {sub && <small>{sub}</small>}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  sub,
  actions,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  const [role, setRole] = useState<"admin" | "user" | null>(null);

  useEffect(() => {
    authClient
      .getSession()
      .then((s) => {
        const admin = (s?.data?.user as { role?: string } | undefined)?.role === "admin";
        setRole(admin ? "admin" : "user");
        if (!admin) {
          fetch("/api/approvals")
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => setPending(Array.isArray(d?.reports) ? d.reports.length : 0))
            .catch(() => setPending(null));
        } else {
          setPending(null);
        }
      })
      .catch(() => setRole("user"));
  }, [pathname]);

  const isAdmin = role === "admin";

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
  }

  const today = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="app">
      <button
        type="button"
        aria-label="Close menu"
        className={`scrim${open ? " show" : ""}`}
        onClick={() => setOpen(false)}
        tabIndex={open ? 0 : -1}
      />
      <aside className={`sidebar${open ? " open" : ""}`} aria-label="Primary">
        <div className="brand">
          <span className="brand-mark">L</span>
          <div>
            <b>Ledger</b>
          </div>
        </div>
        {role === null ? (
          <p className="muted" style={{ padding: "10px 12px" }}>
            Loading…
          </p>
        ) : isAdmin ? (
          <NavLinks links={ADMIN_LINKS} pathname={pathname} pending={null} onNavigate={() => setOpen(false)} />
        ) : (
          <NavLinks links={LINKS} pathname={pathname} pending={pending} onNavigate={() => setOpen(false)} />
        )}
        <div className="side-foot">
          <button type="button" className="secondary" style={{ width: "100%" }} onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <button type="button" className="hamburger" aria-label="Open menu" onClick={() => setOpen(true)}>
            ☰
          </button>
          <span className="date">{today}</span>
          <span className="spacer" />
          {!!pending && (
            <Link href="/approvals" style={{ color: "var(--danger)", fontWeight: 800, textDecoration: "none" }}>
              {pending} pending
            </Link>
          )}
        </div>
        <div className="content">{children}</div>
      </div>

      <nav className="bottomnav" aria-label="Primary">
        {role === null ? null : (
          (isAdmin ? ADMIN_LINKS : LINKS).map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link key={link.href} href={link.href} className={active ? "active" : ""}>
                <span className="ico" aria-hidden>
                  {link.ico}
                </span>
                {link.label}
                {link.href === "/approvals" && !!pending && <span className="dot">{pending}</span>}
              </Link>
            );
          })
        )}
      </nav>
    </div>
  );
}
