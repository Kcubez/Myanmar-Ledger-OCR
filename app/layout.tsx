import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ledger Dashboard",
  description: "Telegram-fed ledger reports and charts",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="my" suppressHydrationWarning><body suppressHydrationWarning>{children}</body></html>;
}
