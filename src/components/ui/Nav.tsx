"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWalletStore } from "@/store/walletStore";

const NAV_ITEMS = [
  { href: "/connect", label: "Identity" },
  { href: "/explorer", label: "Discovery" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/log", label: "History" },
];

export default function Nav() {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const { address, usdcBalance } = useWalletStore();
  const [balanceFlash, setBalanceFlash] = useState<"none" | "deduct" | "refund">("none");
  const prevBalance = useRef(usdcBalance);

  useEffect(() => { setMounted(true); }, []);

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
      : "text-mint";

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-mint/20 bg-bg-base/90 backdrop-blur-sm">
      <div className="max-w-[1920px] mx-auto px-10 h-14 flex items-center justify-between">
        <span className="font-display text-mint text-sm uppercase tracking-widest">
          AIP
        </span>

        <div className="flex items-center gap-8">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const isLocked = mounted && !address && item.href !== "/connect";
            return (
              <Link
                key={item.href}
                href={isLocked ? "/connect" : item.href}
                className={`
                  font-mono text-xs uppercase tracking-wider transition-colors duration-200
                  ${isActive ? "text-mint" : "text-muted hover:text-mint"}
                  ${isLocked ? "opacity-30 pointer-events-none" : ""}
                `}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        {mounted && address ? (
          <div className="flex items-center gap-4">
            <span className={`font-mono text-xs uppercase transition-colors duration-300 ${balanceColor}`}>
              {usdcBalance} USDC
            </span>
            <div className="w-px h-4 bg-mint/10" />
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="font-mono text-xs text-muted uppercase">
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
