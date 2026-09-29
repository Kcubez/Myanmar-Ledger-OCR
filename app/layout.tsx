import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { MuiProvider } from "../components/MuiProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Ledger Dashboard",
  description: "Telegram-fed ledger reports and charts",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="my" suppressHydrationWarning>
      <body suppressHydrationWarning className={inter.variable}>
        <MuiProvider>{children}</MuiProvider>
      </body>
    </html>
  );
}
