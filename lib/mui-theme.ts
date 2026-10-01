import { createTheme } from "@mui/material/styles";

/**
 * Ledger MUI theme — mirrors the existing flat brand tokens in
 * app/globals.css (:root --leaf/--ink/--line/--danger).
 * Numerals render in Inter (loaded via next/font in app/layout.tsx);
 * Myanmar script falls back to Noto Sans Myanmar.
 */
export const appTheme = createTheme({
  palette: {
    primary: { main: "#7955c7", dark: "#6040a3", light: "#f0eafa", contrastText: "#fff" },
    success: { main: "#176637", light: "#e2f5e6" },
    error: { main: "#a63434", dark: "#7c2727", light: "#f7e5e5" },
    warning: { main: "#8a5b00", light: "#fff0cf" },
    background: { default: "#f7f6fb", paper: "#ffffff" },
    text: { primary: "#252332", secondary: "#777383" },
    divider: "#e9e6ef",
  },
  typography: {
    fontFamily: 'var(--font-inter), "Noto Sans Myanmar", Arial, sans-serif',
  },
  shape: { borderRadius: 14 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { textTransform: "none", fontWeight: 700, borderRadius: 8 },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 800 },
      },
    },
  },
});
