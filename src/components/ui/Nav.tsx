"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWalletStore } from "@/store/walletStore";
import ProtocolHealth from "@/components/ui/ProtocolHealth";

const NAV_ITEMS = [
  { href: "/connect", label: "01 // Identity" },
  { href: "/explorer", label: "02 // Agent Cards" },
  { href: "/dashboard", label: "03 // Task Dashboard" },
  { href: "/log", label: "04 // Tx Log" },
];

export default function Nav() {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const { address, usdcBalance } = useWalletStore();
  const [balanceFlash, setBalanceFlash] = useState<"none" | "deduct" | "refund">("none");
  const prevBalance = useRef(usdcBalance);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const prev = parseFloat(prevBalance.current);
    const curr = parseFloat(usdcBalance);
    if (prev !== curr) {
      setBalanceFlash(curr < prev ? "deduct" : "refund");
      const timer = setTimeout(() => setBalanceFlash("none"), 1200);
      prevBalance.current = usdcBalance;
      return () => clearTimeout(timer);
    }
  }, [usdcBalance, mounted]);

  const balanceColor =
    balanceFlash === "deduct"
      ? "text-red-400 animate-balance-flash"
      : balanceFlash === "refund"
      ? "text-accent animate-balance-flash"
      : "text-muted";

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-forest-deep/60 bg-bg-base/90 backdrop-blur-sm">
      <div className="max-w-[1920px] mx-auto px-10 h-14 flex items-center justify-between">
        {/* Left: Logo + Protocol Health */}
        <div className="flex items-center gap-5">
          <span className="font-display text-off-white text-sm uppercase tracking-widest">
            AIP
          </span>
          {mounted && address && (
            <>
              <div className="w-px h-4 bg-forest-deep/60" />
              <ProtocolHealth />
            </>
          )}
        </div>

        {/* Center: Navigation */}
        <div className="flex items-center gap-8">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const isLocked = mounted && !address && item.href !== "/connect";
            return (
              <Link
                key={item.href}
                href={isLocked ? "/connect" : item.href}
                className={`
                  font-mono text-[10px] uppercase tracking-[0.05em] transition-colors duration-200
                  ${isActive ? "text-accent" : "text-muted hover:text-off-white"}
                  ${isLocked ? "opacity-30 pointer-events-none" : ""}
                `}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Right: Balance + Wallet */}
        {mounted && address ? (
          <div className="flex items-center gap-4">
            <span className={`font-mono text-[10px] uppercase transition-colors duration-300 ${balanceColor}`}>
              {usdcBalance} USDC
            </span>
            <div className="w-px h-4 bg-forest-deep/60" />
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="font-mono text-[10px] text-muted uppercase">
                {address.slice(0, 4)}...{address.slice(-4)}
              </span>
            </div>
          </div>
        ) : (
          <div className="w-24" />
        )}
      </div>
    </nav>
  );
}
