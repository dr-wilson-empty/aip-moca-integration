import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/ui/Nav";
import WalletProvider from "@/components/connect/WalletProvider";
import WalletSync from "@/components/connect/WalletSync";

export const metadata: Metadata = {
  title: "AIP — Agent Internet Protocol",
  description:
    "A foundational open protocol for the agentic web. Discover, negotiate, and settle payments between AI agents.",
  icons: {
    icon: "/favicon.ico",
    apple: "/aipLogo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-bg-base text-mint font-mono min-h-screen" suppressHydrationWarning>
        <WalletProvider>
          <WalletSync />
          <Nav />
          <main className="pt-14" style={{ paddingTop: 64 }}>{children}</main>
        </WalletProvider>
      </body>
    </html>
  );
}
