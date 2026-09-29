"use client";

import { Box, CircularProgress } from "@mui/material";

export default function Loading() {
  return (
    <Box
      component="main"
      aria-busy="true"
      sx={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        bgcolor: "var(--background, #f5f7f4)",
      }}
    >
      <CircularProgress size={32} thickness={4} sx={{ color: "var(--leaf, #21633e)" }} />
    </Box>
  );
}


