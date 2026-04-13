"use client";

import { useState, useEffect } from "react";

const DS = {
  bg: "#e6e5e0",
  border: "#000000",
  text: "#000000",
  textMuted: "#666666",
  dark: "#222222",
  green: "#7cb342",
  error: "#c62828",
  white: "#ffffff",
  fontPrimary: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  fontMono: '"Courier New", Courier, monospace',
};

interface LeaderboardUser { rank: number; address: string; tasks: number; spent: string; }

const bandLabel: React.CSSProperties = { fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" };

export default function LeaderboardPage() {
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/leaderboard").then((r) => r.json()).then((d) => setUsers(d.users ?? [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-lb-theme", "true");
    style.textContent = `
      body { background-color: ${DS.bg} !important; color: ${DS.text} !important; }
      main.pt-14 { padding-top: 56px; }
      nav[aria-label="Main navigation"] { background-color: ${DS.bg} !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
      nav[aria-label="Main navigation"] a, nav[aria-label="Main navigation"] span { color: ${DS.text} !important; font-family: ${DS.fontMono} !important; }
      nav[aria-label="Main navigation"] a:hover { color: ${DS.textMuted} !important; }
      nav[aria-label="Main navigation"] a[aria-current="page"] { color: ${DS.text} !important; font-weight: 700 !important; }
      nav[aria-label="Main navigation"] .w-2.h-2 { background-color: ${DS.green} !important; }
      nav[aria-label="Main navigation"] .w-px { background-color: ${DS.border} !important; opacity: 0.2; }
      main.pt-14 * { color: #000000 !important; }
      main.pt-14 .mp-white-text { color: #ffffff !important; }
      main.pt-14 .ds-accent-text { color: ${DS.green} !important; }
      main.pt-14 .ds-muted-text { color: ${DS.textMuted} !important; }
      .lb-hero-header::after {
        content: "LEADERBOARD";
        position: absolute;
        bottom: -15px;
        right: -10px;
        font-size: 10rem;
        color: #d5d0c8;
        font-weight: 700;
        pointer-events: none;
        line-height: 0.8;
        z-index: 0;
        letter-spacing: -0.05em;
        font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      }
      .lb-row { transition: background-color 0.1s ease; }
      .lb-row:hover { background-color: #d9d8d3 !important; }
      ::-webkit-scrollbar-track { background: ${DS.bg} !important; }
      ::-webkit-scrollbar-thumb { background: ${DS.textMuted} !important; }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  return (
    <div style={{ width: "100%", maxWidth: 1920, margin: "0 auto", padding: "0 0 40px", fontFamily: DS.fontPrimary, WebkitFontSmoothing: "antialiased" }}>

      {/* Hero Header */}
      <header className="lb-hero-header" style={{ padding: "30px 40px 0", borderBottom: `1px solid ${DS.border}`, position: "relative", overflow: "hidden" }}>
        <h2 style={{ position: "relative", zIndex: 1, fontSize: "8rem", fontWeight: 300, lineHeight: 0.85, textTransform: "uppercase", letterSpacing: "-0.03em", color: DS.text, fontFamily: DS.fontPrimary, textShadow: "3px 3px 0px #d5d0c8", margin: 0, marginBottom: -6 }}>
          Board
        </h2>
      </header>

      {/* Table */}
      {loading ? (
        <div style={{ padding: "60px 30px", textAlign: "center" }}>
          <span style={{ ...bandLabel, color: DS.textMuted }}>LOADING...</span>
        </div>
      ) : users.length === 0 ? (
        <div style={{ padding: "80px 30px", textAlign: "center" }}>
          <p style={{ ...bandLabel, color: DS.textMuted }}>NO COMPLETED TASKS YET. BE THE FIRST!</p>
        </div>
      ) : (
        <div>
          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 100px 120px", padding: "10px 30px", borderBottom: `1px solid ${DS.border}`, backgroundColor: "#d5d0c8" }}>
            <span style={{ ...bandLabel, fontSize: "0.75rem", color: DS.textMuted }}>RANK</span>
            <span style={{ ...bandLabel, fontSize: "0.75rem", color: DS.textMuted }}>WALLET</span>
            <span style={{ ...bandLabel, fontSize: "0.75rem", color: DS.textMuted, textAlign: "right" }}>TASKS</span>
            <span style={{ ...bandLabel, fontSize: "0.75rem", color: DS.textMuted, textAlign: "right" }}>USDC</span>
          </div>

          {/* Rows */}
          {users.map((user) => (
            <div key={user.address} className="lb-row" style={{
              display: "grid", gridTemplateColumns: "60px 1fr 100px 120px", padding: "14px 30px",
              borderBottom: "1px solid #ccc", alignItems: "center",
              fontFamily: DS.fontMono, fontSize: "0.9rem", fontWeight: 700,
              backgroundColor: user.rank <= 3 ? "#dddcd7" : "transparent",
            }}>
              <span style={{ fontFamily: DS.fontPrimary, fontSize: user.rank <= 3 ? "1.5rem" : "1rem", fontWeight: user.rank <= 3 ? 400 : 700, textAlign: "center" }}>
                {user.rank}
              </span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.address.slice(0, 6)}...{user.address.slice(-4)}
              </span>
              <span style={{ textAlign: "right" }}>{user.tasks}</span>
              <span className="ds-accent-text" style={{ textAlign: "right" }}>{user.spent} USDC</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
