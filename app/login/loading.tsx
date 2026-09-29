"use client";

import { Box, Card, Skeleton } from "@mui/material";

export default function AuthLoading() {
  return (
    <Box
      component="main"
      aria-busy="true"
      sx={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: { xs: 2.5, sm: 4 },
        background: "linear-gradient(145deg, #f0f4f1 0%, #f7faf7 50%, #edf3ef 100%)",
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
          boxShadow: "0 12px 36px -8px rgba(23, 36, 27, 0.08)",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {/* Brand logo skeleton */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
          <Skeleton variant="rounded" width={40} height={40} sx={{ borderRadius: "12px" }} />
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            <Skeleton variant="text" width={80} height={20} />
            <Skeleton variant="text" width={120} height={14} />
          </Box>
        </Box>

        {/* Header skeleton */}
        <Skeleton variant="text" width={100} height={16} />
        <Skeleton variant="rounded" width={160} height={36} sx={{ borderRadius: "8px" }} />
        <Skeleton variant="text" width="90%" height={18} />

        {/* Input fields skeleton */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <Skeleton variant="rounded" width="100%" height={56} sx={{ borderRadius: "10px" }} />
          <Skeleton variant="rounded" width="100%" height={56} sx={{ borderRadius: "10px" }} />
          <Skeleton variant="rounded" width="100%" height={48} sx={{ borderRadius: "10px", mt: 0.5 }} />
        </Box>
      </Card>
    </Box>
  );
}
