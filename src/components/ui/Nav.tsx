"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWalletStore } from "@/store/walletStore";

const NAV_ITEMS = [
  { href: "/twin", label: "Twin" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/automations", label: "Auto" },
  { href: "/create-agent", label: "Create" },
  { href: "/my-agents", label: "Agents" },
  { href: "/how", label: "How" },
  { href: "/leaderboard", label: "Board" },
  { href: "/log", label: "History" },
  { href: "/profile", label: "Profile" },
];

/* navbar.js exact values */
const TAB = {
  activeBg: "#e6e5e0",
  inactive1: "#CED7DE",
  inactive2: "#94A3B0",
  textColor: "#111111",
  font: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  fontSize: "16px",
  fontWeightNormal: 700,
  fontWeightActive: 700,
  letterSpacing: "0.02em",
  borderRadius: "12px 12px 0 0",
  marginRight: "-12px",
  clipPath: "polygon(10% 0, 90% 0, 100% 100%, 0% 100%)",
  minWidth: "120px",
  paddingActive: "14px 30px 12px",
  paddingInactive: "14px 30px 10px",
  containerHeight: "54px",
};

/* Alternating inactive colors between the two tones */
function inactiveColor(index: number): string {
  return index % 2 === 0 ? TAB.inactive1 : TAB.inactive2;
}

export default function Nav() {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const { address, usdcBalance } = useWalletStore();
  const [balanceFlash, setBalanceFlash] = useState<"none" | "deduct" | "refund">("none");
  const prevBalance = useRef(usdcBalance);
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  /* Override: remove nav border on all pages */
  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-nav-override", "true");
    style.textContent = `
      nav[aria-label="Main navigation"] {
        border: none !important;
        border-bottom: none !important;
        box-shadow: none !important;
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
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
      : "text-mint";

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50"
      aria-label="Main navigation"
      style={{ backgroundColor: "transparent", paddingTop: 12 }}
    >
      <div
        style={{
          maxWidth: 1920,
          margin: "0 auto",
          display: "flex",
          alignItems: "flex-end",
          height: TAB.containerHeight,
          padding: 0,
        }}
      >
        {/* Logo area with bottom border */}
        <Link
          href={address ? "/marketplace" : "/connect"}
          aria-label="AIP Home"
          style={{
            display: "flex",
            alignItems: "center",
            alignSelf: "stretch",
            paddingLeft: 16,
            paddingRight: 12,
            flexShrink: 0,
            borderBottom: "1px solid #000",
          }}
        >
          <img src="/aipLogo.png" alt="AIP" style={{ height: 56, width: "auto", display: "block" }} />
        </Link>

        {/* Left border line */}
        <div style={{ alignSelf: "flex-end", flex: 1, minWidth: 0, borderBottom: "1px solid #000", height: 1 }} />

        {/* Tabs — centered */}
        <div
          role="menubar"
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            height: "100%",
            flexShrink: 0,
          }}
        >
          {NAV_ITEMS.map((item, index) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            const isLocked = mounted && !address;
            const isHovered = hoveredTab === item.href && !isActive;

            return (
              <Link
                key={item.href}
                href={isLocked ? "/connect" : item.href}
                role="menuitem"
                aria-current={isActive ? "page" : undefined}
                tabIndex={isLocked ? -1 : 0}
                onMouseEnter={() => setHoveredTab(item.href)}
                onMouseLeave={() => setHoveredTab(null)}
                style={{
                  padding: isActive ? TAB.paddingActive : TAB.paddingInactive,
                  fontFamily: TAB.font,
                  fontSize: TAB.fontSize,
                  fontWeight: isActive ? TAB.fontWeightActive : TAB.fontWeightNormal,
                  letterSpacing: TAB.letterSpacing,
                  color: TAB.textColor,
                  textDecoration: "none",
                  backgroundColor: isActive ? TAB.activeBg : inactiveColor(index),
                  borderRadius: TAB.borderRadius,
                  marginRight: TAB.marginRight,
                  cursor: "pointer",
                  position: "relative",
                  zIndex: isActive ? 10 : NAV_ITEMS.length - index,
                  clipPath: TAB.clipPath,
                  minWidth: TAB.minWidth,
                  textAlign: "center",
                  transition: "transform 0.2s ease",
                  transform: isHovered ? "translateY(-2px)" : "translateY(0)",
                  userSelect: "none",
                  opacity: isLocked ? 0.3 : 1,
                  pointerEvents: isLocked ? "none" : "auto",
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Right border line */}
        <div style={{ alignSelf: "flex-end", flex: 1, minWidth: 0, borderBottom: "1px solid #000", height: 1 }} />

        {/* Wallet */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            alignSelf: "stretch",
            gap: 12,
            flexShrink: 0,
            paddingLeft: 12,
            paddingRight: 16,
            borderBottom: "1px solid #000",
          }}
        >
          {mounted && address ? (
            <>
              <span style={{ fontFamily: TAB.font, fontSize: "15px", fontWeight: 700, textTransform: "uppercase" }} className={`transition-colors duration-300 ${balanceColor}`}>
                {usdcBalance} USDC
              </span>
              <div style={{ width: 1, height: 16, backgroundColor: "#ccc" }} />
              <Link href="/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                <span style={{ fontFamily: TAB.font, fontSize: "13px", fontWeight: 700, textTransform: "uppercase", color: "#666" }}>
                  {address.slice(0, 4)}...{address.slice(-4)}
                </span>
              </Link>
            </>
          ) : (
            <Link
              href="/connect"
              style={{
                fontFamily: TAB.font,
                fontSize: "13px",
                fontWeight: 500,
                color: "#666",
                textDecoration: "none",
                textTransform: "uppercase",
              }}
            >
              Connect
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
