"use client";

import { Box, Card, Typography } from "@mui/material";

export function AuthLayout({
  eyebrow,
  title,
  sub,
  children,
  foot,
}: {
  eyebrow: string;
  title: string;
  sub: string;
  children: React.ReactNode;
  foot?: React.ReactNode;
}) {
  return (
    <Box
      component="main"
      sx={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: { xs: 2.5, sm: 4 },
        background: "linear-gradient(145deg, #f0f4f1 0%, #f7faf7 50%, #edf3ef 100%)",
        position: "relative",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          top: "-15%",
          right: "-10%",
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(121, 85, 199, 0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        },
        "&::after": {
          content: '""',
          position: "absolute",
          bottom: "-20%",
          left: "-10%",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(23, 102, 55, 0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        },
      }}
    >
      <Card
        elevation={0}
        sx={{
          width: "100%",
          maxWidth: 440,
          p: { xs: 3.5, sm: 4.5 },
          borderRadius: "20px",
          border: "1px solid rgba(216, 225, 216, 0.9)",
          bgcolor: "rgba(255, 255, 255, 0.94)",
          backdropFilter: "blur(12px)",
          boxShadow: "0 12px 36px -8px rgba(23, 36, 27, 0.08), 0 4px 12px -2px rgba(23, 36, 27, 0.03)",
          position: "relative",
          zIndex: 1,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 3 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              display: "grid",
              placeItems: "center",
              borderRadius: "12px",
              bgcolor: "var(--leaf)",
              color: "#fff",
              fontWeight: 800,
              fontSize: "1.2rem",
              boxShadow: "0 4px 10px rgba(121, 85, 199, 0.25)",
            }}
          >
            L
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.2, color: "var(--ink)", letterSpacing: "-0.01em" }}>
              Ledger
            </Typography>
            <Typography variant="caption" sx={{ color: "var(--muted)", fontWeight: 500, fontSize: "0.75rem" }}>
              Management System
            </Typography>
          </Box>
        </Box>

        <Typography
          sx={{
            m: 0,
            color: "var(--leaf)",
            fontSize: "0.75rem",
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {eyebrow}
        </Typography>

        <Typography
          variant="h4"
          component="h1"
          sx={{
            mt: 0.5,
            mb: 0.75,
            fontWeight: 700,
            fontSize: { xs: "1.75rem", sm: "2rem" },
            color: "var(--ink)",
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </Typography>

        <Typography variant="body2" sx={{ color: "var(--muted)", mb: 3, lineHeight: 1.45 }}>
          {sub}
        </Typography>

        {children}

        {foot && (
          <Box sx={{ mt: 3, pt: 2, borderTop: "1px solid var(--line)", textAlign: "center" }}>
            <Typography variant="body2" sx={{ color: "var(--muted)" }}>
              {foot}
            </Typography>
          </Box>
        )}
      </Card>
    </Box>
  );
}

