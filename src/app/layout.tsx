import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/ui/Nav";
import WalletProvider from "@/components/connect/WalletProvider";

export const metadata: Metadata = {
  title: "AIP — Agent Internet Protocol",
  description:
    "A foundational open protocol for the agentic web. Discover, negotiate, and settle payments between AI agents.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-bg-base text-off-white font-mono min-h-screen">
        <WalletProvider>
          <Nav />
          <main className="pt-14">{children}</main>
        </WalletProvider>
      </body>
    </html>
  );
}
