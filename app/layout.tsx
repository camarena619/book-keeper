import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "LedgerLLC — AI-Powered Bookkeeping",
  description: "Multi-tenant bookkeeping & invoicing for small business LLCs.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) inject
          attributes onto <body> before React hydrates — this ignores that
          benign mismatch without masking real hydration bugs deeper in the tree. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
