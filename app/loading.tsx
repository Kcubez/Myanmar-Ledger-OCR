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
        bgcolor: "var(--background, #f7f6fb)",
      }}
    >
      <CircularProgress size={32} thickness={4} sx={{ color: "var(--leaf, #7955c7)" }} />
    </Box>
  );
}


