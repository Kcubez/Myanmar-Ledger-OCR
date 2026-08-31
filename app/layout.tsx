import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "စာရင်း OCR",
  description: "Myanmar handwritten ledger extraction",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="my" suppressHydrationWarning><body suppressHydrationWarning>{children}</body></html>;
}
