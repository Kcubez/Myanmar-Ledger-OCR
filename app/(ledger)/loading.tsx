"use client";

import { Box, Card, Skeleton } from "@mui/material";

export default function LedgerLoading() {
  return (
    <Box
      aria-busy="true"
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 2.5,
        animation: "fadeIn 0.25s ease-out",
        "@keyframes fadeIn": {
          "0%": { opacity: 0, transform: "translateY(3px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
      }}
    >
      {/* Page Header skeleton */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, flexWrap: "wrap", mb: 0.5 }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
          <Skeleton variant="text" width={90} height={16} sx={{ borderRadius: "4px" }} />
          <Skeleton variant="rounded" width={200} height={34} sx={{ borderRadius: "8px" }} />
          <Skeleton variant="text" width={280} height={18} sx={{ borderRadius: "4px" }} />
        </Box>
        {/* Date Filter pill skeleton */}
        <Skeleton variant="rounded" width={260} height={38} sx={{ borderRadius: "12px" }} />
      </Box>

      {/* KPI Stat Cards skeleton */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(4, 1fr)" },
          gap: 1.5,
        }}
      >
        {[1, 2, 3, 4].map((i) => (
          <Card
            key={i}
            elevation={0}
            sx={{
              p: 2,
              borderRadius: "14px",
              border: "1px solid var(--line)",
              bgcolor: "var(--paper)",
              display: "flex",
              flexDirection: "column",
              gap: 1,
            }}
          >
            <Skeleton variant="text" width="40%" height={14} />
            <Skeleton variant="rounded" width="65%" height={32} sx={{ borderRadius: "6px" }} />
            <Skeleton variant="text" width="55%" height={14} />
          </Card>
        ))}
      </Box>

      {/* Content skeleton: Grid of chart/tables */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1.4fr 1fr" },
          gap: 2,
        }}
      >
        <Card
          elevation={0}
          sx={{
            p: 2.5,
            borderRadius: "14px",
            border: "1px solid var(--line)",
            bgcolor: "var(--paper)",
            minHeight: 280,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Skeleton variant="rounded" width={140} height={20} sx={{ borderRadius: "4px" }} />
            <Skeleton variant="rounded" width={70} height={20} sx={{ borderRadius: "4px" }} />
          </Box>
          <Skeleton variant="rounded" width="100%" height={200} sx={{ borderRadius: "8px" }} />
        </Card>

        <Card
          elevation={0}
          sx={{
            p: 2.5,
            borderRadius: "14px",
            border: "1px solid var(--line)",
            bgcolor: "var(--paper)",
            minHeight: 280,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <Skeleton variant="rounded" width={120} height={20} sx={{ borderRadius: "4px" }} />
          <Box sx={{ display: "flex", justifyContent: "center", py: 1.5 }}>
            <Skeleton variant="circular" width={150} height={150} />
          </Box>
          <Skeleton variant="rounded" width="100%" height={14} sx={{ borderRadius: "4px" }} />
        </Card>
      </Box>

      {/* Table skeleton */}
      <Card
        elevation={0}
        sx={{
          p: 2.5,
          borderRadius: "14px",
          border: "1px solid var(--line)",
          bgcolor: "var(--paper)",
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
        }}
      >
        <Skeleton variant="rounded" width={160} height={22} sx={{ borderRadius: "4px" }} />
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {[1, 2, 3, 4, 5].map((row) => (
            <Skeleton key={row} variant="rounded" width="100%" height={38} sx={{ borderRadius: "6px" }} />
          ))}
        </Box>
      </Card>
    </Box>
  );
}

