"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Avatar,
  Menu,
  MenuItem,
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
import { useToast } from "./ToastProvider";

const DRAWER_WIDTH = 250;

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/inventory", label: "Inventory" },
  { href: "/maintenance", label: "Maintenance" },
  { href: "/revenue", label: "Revenue" },
  { href: "/expense", label: "Expense" },
  { href: "/approvals", label: "Approvals" },
  { href: "/settings", label: "Settings" },
];

const ADMIN_LINKS = [{ href: "/admin/users", label: "Users" }];

const TONE_TEXT: Record<string, string> = {
  good: "var(--ok)",
  bad: "var(--bad)",
  warn: "var(--warn)",
};

function NavIcon({ href }: { href: string }) {
  const paths: Record<string, string> = {
    "/dashboard": "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    "/inventory": "M3 7l9-4 9 4v13H3z M3 7h18 M9 11h6",
    "/maintenance": "M14 5a5 5 0 0 0-6 6L3 16l5 5 5-5a5 5 0 0 0 6-6l-4 3-4-4z",
    "/revenue": "M4 18V6 M4 18h16 M7 14l5-5 4 3 5-7",
    "/expense": "M4 6v12h16 M7 7l5 5 4-3 5 7",
    "/approvals": "M8 3h8v4H8z M7 5H4v16h16V5h-3 M8 14l3 3 5-6",
    "/settings": "M4 7h16 M4 17h16 M8 4v6 M16 14v6",
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[href] ?? paths["/settings"]} /></svg>;
}

function NavLinks({
  links,
  pathname,
  pending,
  onNavigate,
  remembered,
}: {
  remembered: Record<string, string>;
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
            href={remembered[link.href] || link.href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            selected={active}
            onClick={onNavigate}
            sx={{
              borderRadius: "10px",
              fontWeight: 600, color: "#bab5c9", px: 2, py: 1,
              "&:hover": { bgcolor: "rgba(255,255,255,.06)", color: "#fff" },
              "&.Mui-selected": { bgcolor: "rgba(172,133,239,.16)", color: "#e0c9ff", boxShadow: "inset 0 0 0 1px rgba(192,158,249,.2)", "&:hover": { bgcolor: "rgba(172,133,239,.22)" } },
            }}
          >
            <ListItemIcon sx={{ minWidth: 34, color: "inherit" }}>
              <NavIcon href={link.href} />
            </ListItemIcon>
            <ListItemText primary={link.label} slotProps={{ primary: { sx: { fontWeight: 500, fontSize: ".88rem" } } }} />
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

export type StatIconName = "trend-up" | "trend-down" | "balance" | "calendar" | "list" | "clock" | "wrench";

const STAT_ICON_PATHS: Record<StatIconName, string> = {
  "trend-up": "M4 18V6 M4 18h16 M7 14l5-5 4 3 5-7",
  "trend-down": "M4 6v12h16 M7 7l5 5 4-3 5 7",
  balance: "M12 4v16 M8 20h8 M12 6L6 8m6-2l6 2 M7 12l-2.5 6a2.8 2.8 0 0 0 5 0L7 12 M17 12l-2.5 6a2.8 2.8 0 0 0 5 0L17 12",
  calendar: "M5 5h14v15H5z M5 9.5h14 M9 3v4 M15 3v4",
  list: "M9 6h11 M9 12h11 M9 18h11 M4.5 6h1 M4.5 12h1 M4.5 18h1",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M12 7v5l3 2",
  wrench: "M14 5a5 5 0 0 0-6 6L3 16l5 5 5-5a5 5 0 0 0 6-6l-4 3-4-4z",
};

export function StatCard({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "warn";
  icon?: StatIconName;
}) {
  return (
    <Card
      elevation={0}
      sx={{
        position: "relative",
        overflow: "hidden",
        border: "1px solid",
        borderColor: "var(--line)",
        borderRadius: "20px",
        bgcolor: "var(--paper)",
        boxShadow: "0 5px 20px rgba(38,25,66,.035)",

      }}
    >
      <CardContent sx={{ p: { xs: "18px 14px", sm: "24px" }, "&:last-child": { pb: "24px" } }}>
        <span className="stat-label-row">
          {icon && (
            <span className="stat-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={STAT_ICON_PATHS[icon]} /></svg>
            </span>
          )}
          <Typography
            variant="caption"
            sx={{ color: "var(--muted)", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em" }}
          >
            {label}
          </Typography>
        </span>
        <Typography
          variant="h5"
          component="b"
          sx={{
            display: "block",
            mt: 2, mb: 1, fontWeight: 650, letterSpacing: "-.04em",
            fontSize: { xs: "clamp(1rem, 4.5vw, 1.45rem)", sm: "1.65rem" },
            fontVariantNumeric: "tabular-nums",
            color: "var(--ink)",
          }}
        >
          {value}
        </Typography>
        {sub && (
          <Typography variant="caption" sx={{ color: tone ? TONE_TEXT[tone] : "var(--muted)" }}>
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
        <Typography variant="h4" component="h1" sx={{ m: "2px 0 4px", fontSize: { xs: "1.55rem", sm: "1.9rem" }, fontWeight: 650, letterSpacing: "-.035em" }}>
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

export function AppShell({ children, role, account }: { children: React.ReactNode; role: "admin" | "user"; account?: { name: string; email: string } }) {
  const [accountAnchor, setAccountAnchor] = useState<HTMLElement | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams().toString();
  const [remembered, setRemembered] = useState<Record<string, string>>({});
  const currentUrl = pathname + (search ? `?${search}` : "");
  if (remembered[pathname] !== currentUrl) {
    setRemembered({ ...remembered, [pathname]: currentUrl });
  }
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  const narrow = useMediaQuery("(max-width:1024px)");

  function refreshPending() {
    fetch("/api/approvals?countOnly=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPending(typeof d?.count === "number" ? d.count : 0))
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
    toast.success("Signed out.");
    router.push("/login");
  }

  const links = isAdmin ? ADMIN_LINKS : LINKS;

  const drawerBody = (
    <Box component="nav" id="ledger-navigation" aria-label="Main navigation" sx={{ p: "18px 14px", display: "flex", flexDirection: "column", gap: 1, height: "100%", color: "#f7f4ff", background: "radial-gradient(ellipse at bottom left, #33213e 0%, transparent 52%), #191720" }}>
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
        {narrow && <IconButton aria-label="Close menu" onClick={() => setOpen(false)} sx={{ ml: "auto", width: 44, height: 44, color: "#fff" }}>×</IconButton>}
      </Box>
      <NavLinks links={links} pathname={pathname} pending={pending} remembered={remembered} onNavigate={() => setOpen(false)} />
      <Box sx={{ mt: "auto", pt: 2, borderTop: "1px solid rgba(255,255,255,.1)" }}>
        <Button fullWidth aria-label="Account menu" aria-haspopup="menu" aria-expanded={Boolean(accountAnchor)}
          onClick={event => setAccountAnchor(event.currentTarget)}
          sx={{ textAlign: "left", justifyContent: "flex-start", gap: 1, px: 1, py: 0.5, minHeight: 44, borderRadius: "10px", color: "#f6f1ff", "&:hover": { bgcolor: "rgba(255,255,255,.06)" } }}>
          <Avatar sx={{ width: 32, height: 32, bgcolor: "#70529a", color: "#fff", fontSize: ".8rem", border: "2px solid #a48abc" }}>{(account?.name || "Ledger").split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase()}</Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}><Typography noWrap sx={{ fontSize: ".88rem", fontWeight: 500 }}>{account?.name || (isAdmin ? "Administrator" : "Ledger account")}</Typography><Typography noWrap sx={{ fontSize: ".68rem", color: "#b9afc5" }}>{account?.email || "Account options"}</Typography></Box>
          <Box component="span" aria-hidden="true" sx={{ color: "#b9afc5", fontSize: ".7rem", transition: "transform .15s", transform: accountAnchor ? "rotate(180deg)" : "none" }}>▾</Box>
        </Button>
        <Menu anchorEl={accountAnchor} open={Boolean(accountAnchor)} onClose={() => setAccountAnchor(null)} anchorOrigin={{ vertical: "top", horizontal: "right" }} transformOrigin={{ vertical: "bottom", horizontal: "right" }}
          slotProps={{ paper: { sx: { borderRadius: "12px", minWidth: 150, p: 0.5 } } }}>
          <MenuItem onClick={() => { setAccountAnchor(null); void signOut(); }} sx={{ gap: 1.5, px: 1.5, py: 1, borderRadius: "8px", color: "#b3261e", fontWeight: 600, fontSize: ".88rem" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 4H4v16h5 M10 12h11 M17 8l4 4-4 4" /></svg>Sign out
          </MenuItem>
        </Menu>
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
            {narrow && <IconButton aria-label="Open menu" aria-expanded={open} aria-controls={open ? "ledger-navigation" : undefined}
              onClick={() => setOpen(true)} sx={{ color: "var(--leaf)", width: 44, height: 44, borderRadius: "10px" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </IconButton>}
            <Typography sx={{ fontWeight: 600, fontSize: ".9rem", color: "var(--muted)" }}>{narrow ? "Ledger" : "Ledger / Workspace"}</Typography>
            {!isAdmin && !!pending && <Button component={Link} href="/approvals" size="small"
              sx={{ ml: "auto", color: "var(--leaf)", bgcolor: "var(--soft)" }}>
              Review {pending}
            </Button>}
          </Box>
        )}
        <Box
          sx={{
            p: { xs: "24px 14px", sm: "32px" },
            pb: "max(24px, env(safe-area-inset-bottom))",
            width: "100%",
            maxWidth: 1440,
            mx: "auto",
          }}
        >
          {children}
        </Box>
      </Box>


    </Box>
  );
}
