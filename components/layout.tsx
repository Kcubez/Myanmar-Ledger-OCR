"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { authClient } from "../lib/auth-client";

const DRAWER_WIDTH = 250;

const LINKS = [
  { href: "/dashboard", label: "Overview", ico: "📊" },
  { href: "/fuel", label: "Fuel", ico: "⛽" },
  { href: "/brick", label: "Brick", ico: "🧱" },
  { href: "/maintenance", label: "Maintenance", ico: "🔧" },
  { href: "/revenue", label: "Revenue", ico: "💰" },
  { href: "/expense", label: "Expense", ico: "💸" },
  { href: "/approvals", label: "Approvals", ico: "✅" },
  { href: "/settings", label: "Settings", ico: "⚙️" },
];

const ADMIN_LINKS = [{ href: "/admin/users", label: "Users", ico: "👥" }];

const TONE_BAR: Record<string, string> = {
  good: "var(--ok)",
  bad: "var(--bad)",
  warn: "var(--warn)",
};

const TONE_BG: Record<string, string> = {
  good: "var(--ok-bg)",
  bad: "var(--bad-bg)",
  warn: "var(--warn-bg)",
};

const TONE_BORDER: Record<string, string> = {
  good: "#bfe3c9",
  bad: "#eec9c9",
  warn: "#ecd9a8",
};

const TONE_TEXT: Record<string, string> = {
  good: "var(--ok)",
  bad: "var(--bad)",
  warn: "var(--warn)",
};

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
    <List disablePadding sx={{ display: "grid", gap: 0.5 }}>
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        const badge = link.href === "/approvals" ? pending : null;
        return (
          <ListItemButton
            key={link.href}
            component={Link}
            href={link.href}
            aria-current={active ? "page" : undefined}
            selected={active}
            onClick={onNavigate}
            sx={{
              borderRadius: "10px",
              fontWeight: 700,
              "&.Mui-selected": { bgcolor: "var(--leaf)", color: "#fff", "&:hover": { bgcolor: "var(--leaf)" } },
            }}
          >
            <ListItemIcon sx={{ minWidth: 34, color: "inherit" }}>
              <span aria-hidden>{link.ico}</span>
            </ListItemIcon>
            <ListItemText primary={link.label} slotProps={{ primary: { sx: { fontWeight: 700 } } }} />
            {!!badge && (
              <Badge
                badgeContent={badge}
                sx={{
                  "& .MuiBadge-badge": active
                    ? { bgcolor: "rgba(255,255,255,.22)", color: "#fff" }
                    : { bgcolor: "var(--soft)", color: "var(--leaf)", fontWeight: 800 },
                }}
              />
            )}
          </ListItemButton>
        );
      })}
    </List>
  );
}

export function StatusPill({ status }: { status: string }) {
  const kind = status === "CONFIRMED" ? "confirmed" : status === "NEEDS_REVIEW" ? "review" : "pending";
  return <Pill tone={kind}>{status.replace("_", " ")}</Pill>;
}

/** Generic tone chip (settings/admin tables). tone: good|warn|bad. */
export function Pill({ tone, children }: { tone: "good" | "warn" | "bad" | "pending" | "confirmed" | "review"; children: React.ReactNode }) {
  const kind = tone === "good" || tone === "confirmed" ? "confirmed" : tone === "bad" || tone === "review" ? "review" : "pending";
  const sx =
    kind === "confirmed"
      ? { bgcolor: "var(--ok-bg)", color: "var(--ok)" }
      : kind === "review"
        ? { bgcolor: "var(--bad-bg)", color: "var(--bad)" }
        : { bgcolor: "var(--warn-bg)", color: "var(--warn)" };
  return <Chip size="small" label={children} sx={{ fontWeight: 800, ...sx }} />;
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
  tone?: "good" | "bad" | "warn";
}) {
  return (
    <Card
      elevation={0}
      sx={{
        position: "relative",
        overflow: "hidden",
        border: "1px solid",
        borderColor: tone ? TONE_BORDER[tone] : "var(--line)",
        borderRadius: "14px",
        bgcolor: tone ? TONE_BG[tone] : "var(--paper)",
        pl: { xs: "6px", sm: "20px" },
        "&::before": {
          content: '""',
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: "4px",
          bgcolor: tone ? TONE_BAR[tone] : "var(--line)",
        },
      }}
    >
      <CardContent sx={{ p: "14px 16px", "&:last-child": { pb: "14px" } }}>
        <Typography
          variant="caption"
          sx={{ color: "var(--muted)", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em" }}
        >
          {label}
        </Typography>
        <Typography
          variant="h5"
          component="b"
          sx={{
            display: "block",
            mt: 0.5,
            fontSize: { xs: "clamp(1rem, 4.5vw, 1.45rem)", sm: "1.65rem" },
            fontVariantNumeric: "tabular-nums",
            color: tone ? TONE_TEXT[tone] : "inherit",
          }}
        >
          {value}
        </Typography>
        {sub && (
          <Typography variant="caption" sx={{ color: "var(--muted)" }}>
            {sub}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

export function PageHeader({
  eyebrow,
  title,
  sub,
  actions,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  actions?: React.ReactNode;
}) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, alignItems: "flex-start", flexWrap: "wrap", mb: "18px" }}>
      <Box>
        {eyebrow && (
          <Typography sx={{ m: 0, color: "var(--leaf)", fontSize: ".74rem", fontWeight: 800 }}>{eyebrow}</Typography>
        )}
        <Typography variant="h4" component="h1" sx={{ m: "2px 0 4px", fontSize: "1.7rem" }}>
          {title}
        </Typography>
        {sub && (
          <Typography className="muted" sx={{ m: 0 }}>
            {sub}
          </Typography>
        )}
      </Box>
      {actions && <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>{actions}</Box>}
    </Box>
  );
}

export function AppShell({ children, role }: { children: React.ReactNode; role: "admin" | "user" }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  const narrow = useMediaQuery("(max-width:1024px)");

  function refreshPending() {
    fetch("/api/approvals")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPending(Array.isArray(d?.reports) ? d.reports.length : 0))
      .catch(() => setPending(null));
  }

  useEffect(() => {
    if (role === "user") refreshPending();
  }, [pathname, role]);

  // Approve/reject actions refresh server content without changing pathname,
  // so the badge would go stale — action buttons dispatch this event.
  useEffect(() => {
    if (role !== "user") return;
    const onPendingChanged = () => refreshPending();
    window.addEventListener("pending-changed", onPendingChanged);
    return () => window.removeEventListener("pending-changed", onPendingChanged);
  }, [role]);

  const isAdmin = role === "admin";

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
  }

  const links = isAdmin ? ADMIN_LINKS : LINKS;

  const drawerBody = (
    <Box component="nav" id="ledger-navigation" aria-label="Main navigation" sx={{ p: "18px 14px", display: "flex", flexDirection: "column", gap: 0.5, height: "100%" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, px: 1, pb: 2 }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            flex: "none",
            display: "grid",
            placeItems: "center",
            borderRadius: "10px",
            bgcolor: "var(--leaf)",
            color: "#fff",
            fontWeight: 800,
          }}
        >
          L
        </Box>
        <Typography sx={{ fontWeight: 700 }}>Ledger</Typography>
        {narrow && <IconButton aria-label="Close menu" onClick={() => setOpen(false)} sx={{ ml: "auto", width: 44, height: 44 }}>×</IconButton>}
      </Box>
      <NavLinks links={links} pathname={pathname} pending={pending} onNavigate={() => setOpen(false)} />
      <Box sx={{ mt: "auto", pt: 2, borderTop: "1px solid var(--line)" }}>
        <Button
          fullWidth
          onClick={signOut}
          sx={{ bgcolor: "var(--soft)", color: "var(--leaf)", "&:hover": { bgcolor: "#e4ede6" } }}
        >
          Sign out
        </Button>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100dvh" }}>
      {narrow ? (
        <Drawer open={open} onClose={() => setOpen(false)} ModalProps={{ keepMounted: true }} sx={{ "& .MuiDrawer-paper": { width: DRAWER_WIDTH, boxSizing: "border-box" } }}>
          {drawerBody}
        </Drawer>
      ) : (
        <Drawer
          variant="permanent"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            "& .MuiDrawer-paper": { width: DRAWER_WIDTH, boxSizing: "border-box", bgcolor: "var(--paper)", borderRight: "1px solid var(--line)" },
          }}
        >
          {drawerBody}
        </Drawer>
      )}

      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {narrow && (
          <Box component="header" sx={{
            position: "sticky", top: 0, zIndex: 40, m: 0,
            display: "flex", alignItems: "center", gap: 1.25,
            px: 2, py: 1, pt: "calc(8px + env(safe-area-inset-top))",
            bgcolor: "var(--paper)", borderBottom: "1px solid var(--line)",
          }}>
            <IconButton aria-label="Open menu" aria-expanded={open} aria-controls={open ? "ledger-navigation" : undefined}
              onClick={() => setOpen(true)} sx={{ color: "var(--leaf)", width: 44, height: 44, borderRadius: "10px" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </IconButton>
            <Typography sx={{ fontWeight: 700, fontSize: "1rem" }}>Ledger</Typography>
            {!isAdmin && !!pending && <Button component={Link} href="/approvals" size="small"
              sx={{ ml: "auto", color: "var(--leaf)", bgcolor: "var(--soft)" }}>
              Review {pending}
            </Button>}
          </Box>
        )}
        <Box
          sx={{
            p: { xs: "20px 14px", sm: "24px" },
            pb: "max(24px, env(safe-area-inset-bottom))",
            width: "100%",
            maxWidth: 1180,
            mx: "auto",
          }}
        >
          {children}
        </Box>
      </Box>


    </Box>
  );
}
