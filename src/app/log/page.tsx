"use client";

import { useEffect } from "react";
import { useWalletStore } from "@/store/walletStore";
import { useLogStore } from "@/store/logStore";
import { signedFetch } from "@/lib/auth/signed-fetch";
import StatsRow from "@/components/log/StatsRow";
import TaskTable from "@/components/log/TaskTable";

const DS = {
  bg: "#e6e5e0",
  border: "#000000",
  text: "#000000",
  textMuted: "#666666",
  dark: "#222222",
  green: "#7cb342",
  white: "#ffffff",
  fontPrimary: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  fontMono: '"Courier New", Courier, monospace',
};

export default function LogPage() {
  const { address } = useWalletStore();
  const { loaded, loadedAddress, loadFromServer, clearTasks } = useLogStore();

  useEffect(() => {
    if (!address) {
      clearTasks();
      return;
    }
    // Re-fetch when wallet changes or not yet loaded
    if (!loaded || loadedAddress !== address) {
      loadFromServer(address);
    }
  }, [address, loaded, loadedAddress, loadFromServer, clearTasks]);

  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-log-theme", "true");
    style.textContent = `
      body { background-color: ${DS.bg} !important; color: ${DS.text} !important; }
      main.pt-14 { padding-top: 56px; }
      nav[aria-label="Main navigation"] { background-color: ${DS.bg} !important;  backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
      nav[aria-label="Main navigation"] a, nav[aria-label="Main navigation"] span { color: ${DS.text} !important; font-family: ${DS.fontMono} !important; }
      nav[aria-label="Main navigation"] a:hover { color: ${DS.textMuted} !important; }
      nav[aria-label="Main navigation"] a[aria-current="page"] { color: ${DS.text} !important; font-weight: 700 !important; }
      nav[aria-label="Main navigation"] .w-2.h-2 { background-color: ${DS.green} !important; }
      nav[aria-label="Main navigation"] .w-px { background-color: ${DS.border} !important; opacity: 0.2; }
      main.pt-14 * { color: #000000 !important; }
      main.pt-14 .mp-white-text { color: #ffffff !important; }
      main.pt-14 .ds-accent-text { color: ${DS.green} !important; }
      main.pt-14 .ds-error-text { color: #c62828 !important; }
      main.pt-14 .ds-muted-text { color: ${DS.textMuted} !important; }
      main.pt-14 input::placeholder { color: #555555 !important; }
      main.pt-14 select, main.pt-14 option { color: #000 !important; background-color: ${DS.bg} !important; }
      ::-webkit-scrollbar-track { background: ${DS.bg} !important; }
      ::-webkit-scrollbar-thumb { background: ${DS.textMuted} !important; }
      .log-hero-header::after {
        content: "TASK LOG";
        position: absolute;
        bottom: -15px;
        right: -10px;
        font-size: 12rem;
        color: #d5d0c8;
        font-weight: 700;
        pointer-events: none;
        line-height: 0.8;
        z-index: 0;
        letter-spacing: -0.05em;
        font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  return (
    <div style={{ width: "100%", maxWidth: 1920, margin: "0 auto", padding: "0 0 40px", fontFamily: DS.fontPrimary, WebkitFontSmoothing: "antialiased" }}>
      {/* Header */}
      <header className="log-hero-header" style={{ padding: "30px 40px 0", borderBottom: `1px solid ${DS.border}`, position: "relative", overflow: "hidden", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <h2 style={{ position: "relative", zIndex: 1, fontSize: "8rem", fontWeight: 300, lineHeight: 0.85, textTransform: "uppercase", letterSpacing: "-0.03em", color: DS.text, fontFamily: DS.fontPrimary, textShadow: "3px 3px 0px #d5d0c8", margin: 0, marginBottom: -6 }}>
          History
        </h2>
        {address && (
          <button onClick={async () => {
            const res = await signedFetch(`/api/tasks/history?address=${address}&format=csv`);
            if (!res.ok) return;
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = `task-history-${address.slice(0, 8)}.csv`; a.click();
            URL.revokeObjectURL(url);
          }} style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", padding: "10px 24px", border: `1px solid ${DS.border}`, backgroundColor: "transparent", cursor: "pointer", position: "relative", zIndex: 1, marginBottom: 8 }}>
            EXPORT CSV
          </button>
        )}
      </header>

      <StatsRow />
      <TaskTable />
    </div>
  );
}
