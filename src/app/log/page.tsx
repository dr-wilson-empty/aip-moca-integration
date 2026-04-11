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
  const { loaded, loadFromServer } = useLogStore();

  useEffect(() => {
    if (address && !loaded) loadFromServer(address);
  }, [address, loaded, loadFromServer]);

  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-log-theme", "true");
    style.textContent = `
      body { background-color: ${DS.bg} !important; color: ${DS.text} !important; }
      main.pt-14 { padding-top: 56px; }
      nav[aria-label="Main navigation"] { background-color: ${DS.bg} !important; border-bottom: 1px solid ${DS.border} !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
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
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  return (
    <div style={{ width: "100%", maxWidth: 1920, margin: "0 auto", padding: "0 0 40px", fontFamily: DS.fontPrimary, WebkitFontSmoothing: "antialiased" }}>
      {/* Header */}
      <header style={{ padding: "40px 30px", borderBottom: `1px solid ${DS.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h2 style={{ fontSize: "4rem", fontWeight: 400, lineHeight: 0.95, textTransform: "uppercase", letterSpacing: "-0.02em", color: DS.text, fontFamily: DS.fontPrimary }}>
            History
          </h2>
          <p style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 400, textTransform: "uppercase", letterSpacing: "0.1em", color: DS.textMuted, marginTop: 16 }}>
            Full history of all agent tasks, payments, and state transitions
          </p>
        </div>
        {address && (
          <button onClick={async () => {
            const res = await signedFetch(`/api/tasks/history?address=${address}&format=csv`);
            if (!res.ok) return;
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = `task-history-${address.slice(0, 8)}.csv`; a.click();
            URL.revokeObjectURL(url);
          }} style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", padding: "10px 24px", border: `1px solid ${DS.border}`, backgroundColor: "transparent", cursor: "pointer" }}>
            EXPORT CSV
          </button>
        )}
      </header>

      <StatsRow />
      <TaskTable />
    </div>
  );
}
