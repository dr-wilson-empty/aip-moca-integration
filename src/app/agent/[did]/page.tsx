"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAgentStore } from "@/store/agentStore";
import { useWalletStore } from "@/store/walletStore";
import type { AgentType, Capability } from "@/types/aip";

/* ─── Types ─── */
interface AgentDetail {
  did: string;
  name: string;
  version: string;
  endpoint: string;
  type: AgentType;
  capabilities: Capability[];
  walletAddress?: string;
  onChain: boolean;
  agentId?: string;
  owner?: string;
  source?: string;
}

/* ─── Design System ─── */
const DS = {
  bg: "#e6e5e0",
  bgHover: "#d9d8d3",
  border: "#000000",
  text: "#000000",
  textMuted: "#666666",
  dark: "#222222",
  green: "#7cb342",
  cyan: "#4dd0e1",
  yellow: "#ffee58",
  error: "#c62828",
  purple: "#7c3aed",
  white: "#ffffff",
  fontPrimary: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  fontMono: '"Courier New", Courier, monospace',
};

const TYPE_COLORS: Record<AgentType, { bg: string; label: string }> = {
  LLM: { bg: DS.cyan, label: "LLM" },
  Task: { bg: DS.green, label: "TASK" },
  Execution: { bg: "#a65d5d", label: "EXECUTION" },
};

const CAP_COLORS: Record<string, string> = {
  "web.search": "#3b6fa0",
  "text.summarize": "#8b5c9e",
  "text.classify": "#7b6b8a",
  "text.translate": "#4a8c7f",
  "text.write": "#6b8e6b",
  "code.audit": "#a65d5d",
  "code.review": "#7a7a7a",
  "data.retrieve": "#c08c4a",
  "data.analyze": "#b8913a",
  "defi.analyze": "#4a7a5e",
  "trade.execute": "#2e6e7a",
  "document.parse": "#c27a3a",
};

/* ─── Sub-components ─── */
function InfoRow({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "12px 0", borderBottom: `1px solid #ccc` }}>
      <span style={{ fontFamily: DS.fontMono, fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: DS.textMuted, flexShrink: 0, width: 140 }}>{label}</span>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, color: DS.text, wordBreak: "break-all" }}>{value}</span>
        {copyable && (
          <button onClick={copy} style={{ fontFamily: DS.fontMono, fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", color: DS.textMuted, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", flexShrink: 0 }}>
            {copied ? "COPIED" : "COPY"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { setCounterpart } = useAgentStore();
  const { address } = useWalletStore();
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ratings, setRatings] = useState<{ avg: number; count: number; ratings: Array<{ rating: number; comment: string; created_at: string }> }>({ avg: 0, count: 0, ratings: [] });
  const [myRating, setMyRating] = useState(0);
  const [myComment, setMyComment] = useState("");
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  const did = decodeURIComponent(params.did as string);

  /* Theme override */
  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-agent-theme", "true");
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
      main.pt-14 input::placeholder { color: #555555 !important; }
      main.pt-14 .mp-white-text { color: #ffffff !important; }
      main.pt-14 .ds-accent-text { color: ${DS.green} !important; }
      main.pt-14 .ds-muted-text { color: ${DS.textMuted} !important; }
      main.pt-14 .ds-star { color: #b8913a !important; }
      ::-webkit-scrollbar-track { background: ${DS.bg} !important; }
      ::-webkit-scrollbar-thumb { background: ${DS.textMuted} !important; }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  useEffect(() => {
    fetch(`/api/agent-card/detail?did=${encodeURIComponent(did)}`)
      .then((r) => { if (!r.ok) throw new Error("Agent not found"); return r.json(); })
      .then((data) => setAgent(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    fetch(`/api/ratings?agentDid=${encodeURIComponent(did)}`)
      .then((r) => r.json())
      .then((data) => setRatings(data))
      .catch(() => {});
  }, [did]);

  const submitRating = async () => {
    if (!address || myRating < 1) return;
    await fetch("/api/ratings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentDid: did, walletAddress: address, rating: myRating, comment: myComment }) });
    setRatingSubmitted(true);
    const res = await fetch(`/api/ratings?agentDid=${encodeURIComponent(did)}`);
    setRatings(await res.json());
  };

  const handleStartTask = () => {
    if (!agent) return;
    setCounterpart({ did: agent.did, name: agent.name, version: agent.version, endpoint: agent.endpoint, type: agent.type, capabilities: agent.capabilities, walletAddress: agent.walletAddress });
    router.push("/dashboard");
  };

  const bandLabel: React.CSSProperties = { fontFamily: DS.fontMono, fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" };
  const btnDark: React.CSSProperties = { padding: "12px 28px", fontFamily: DS.fontMono, fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", backgroundColor: DS.dark, color: DS.bg, border: "none", cursor: "pointer" };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <span style={{ ...bandLabel, color: DS.textMuted }}>LOADING AGENT...</span>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 16 }}>
        <span style={{ ...bandLabel, color: DS.error }}>{error || "AGENT NOT FOUND"}</span>
        <button onClick={() => router.push("/marketplace")} style={{ ...bandLabel, color: DS.textMuted, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>BACK TO MARKETPLACE</button>
      </div>
    );
  }

  const typeConfig = TYPE_COLORS[agent.type] || TYPE_COLORS.Task;

  return (
    <div style={{ width: "100%", maxWidth: 1920, margin: "0 auto", padding: "0 0 40px", fontFamily: DS.fontPrimary, WebkitFontSmoothing: "antialiased" }}>

      {/* ═══ Breadcrumb ═══ */}
      <div style={{ padding: "12px 30px", borderBottom: `1px solid ${DS.border}` }}>
        <button onClick={() => router.push("/marketplace")} style={{ ...bandLabel, fontSize: "0.65rem", color: DS.textMuted, background: "none", border: "none", cursor: "pointer" }}>
          MARKETPLACE / {agent.name.toUpperCase()}
        </button>
      </div>

      {/* ═══ Hero Header ═══ */}
      <header style={{ padding: "40px 30px", borderBottom: `1px solid ${DS.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <h1 style={{ fontSize: "3.5rem", fontWeight: 400, lineHeight: 0.95, textTransform: "uppercase", letterSpacing: "-0.02em", color: DS.text, fontFamily: DS.fontPrimary }}>{agent.name}</h1>
            <span className="mp-white-text" style={{ fontSize: "0.7rem", padding: "4px 12px", backgroundColor: typeConfig.bg, fontFamily: DS.fontMono, fontWeight: 700, textTransform: "uppercase" }}>{typeConfig.label}</span>
            {agent.onChain && <span className="mp-white-text" style={{ fontSize: "0.7rem", padding: "4px 12px", backgroundColor: DS.purple, fontFamily: DS.fontMono, fontWeight: 700, textTransform: "uppercase" }}>ON-CHAIN</span>}
          </div>
          <p style={{ ...bandLabel, color: DS.textMuted, fontWeight: 400 }}>
            {agent.capabilities.length} {agent.capabilities.length > 1 ? "CAPABILITIES" : "CAPABILITY"} / V{agent.version}
            {agent.agentId && <span> / ID: {agent.agentId}</span>}
          </p>
          {ratings.count > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <span className="ds-star" style={{ fontSize: "1.2rem" }}>{"★".repeat(Math.round(ratings.avg))}{"☆".repeat(5 - Math.round(ratings.avg))}</span>
              <span style={{ fontFamily: DS.fontPrimary, fontSize: "1.2rem", fontWeight: 400 }}>{ratings.avg.toFixed(1)}</span>
              <span className="ds-muted-text" style={{ ...bandLabel, fontSize: "0.65rem" }}>({ratings.count} REVIEWS)</span>
            </div>
          )}
        </div>
        <button onClick={handleStartTask} className="mp-white-text" style={btnDark}>START TASK</button>
      </header>

      {/* ═══ Info + Sidebar Grid ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", borderBottom: `1px solid ${DS.border}` }}>

        {/* Left: Agent Info */}
        <div style={{ borderRight: `1px solid ${DS.border}`, padding: "24px 30px" }}>
          <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 8 }}>AGENT INFORMATION</span>
          <InfoRow label="DID" value={agent.did} copyable />
          <InfoRow label="Endpoint" value={agent.endpoint} copyable />
          {agent.walletAddress && <InfoRow label="Payment Wallet" value={agent.walletAddress} copyable />}
          {agent.owner && <InfoRow label="Owner" value={agent.owner} copyable />}

          {/* Capabilities */}
          <div style={{ marginTop: 32 }}>
            <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 12 }}>CAPABILITIES</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {agent.capabilities.map((cap) => {
                const capColor = CAP_COLORS[cap.id] || DS.textMuted;
                return (
                  <div key={cap.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid #ccc" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 4, height: 28, backgroundColor: capColor, display: "inline-block", flexShrink: 0 }} />
                      <div>
                        <span style={{ fontFamily: DS.fontPrimary, fontSize: "1rem", fontWeight: 400, textTransform: "uppercase" }}>{cap.description}</span>
                        <span className="ds-muted-text" style={{ fontFamily: DS.fontMono, fontSize: "0.6rem", display: "block", marginTop: 2 }}>{cap.id}</span>
                      </div>
                    </div>
                    <span style={{ fontFamily: DS.fontPrimary, fontSize: "1.2rem", fontWeight: 400 }}>{cap.pricing.amount} <span style={{ fontSize: "0.7rem", fontWeight: 700 }}>USDC</span></span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Sidebar */}
        <div>
          {/* Quick Task */}
          <div style={{ padding: "24px 30px", borderBottom: `1px solid ${DS.border}` }}>
            <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 12 }}>QUICK TASK</span>
            {agent.capabilities.map((cap) => (
              <button key={cap.id} onClick={handleStartTask} style={{ width: "100%", textAlign: "left", padding: "12px 16px", border: `1px solid ${DS.border}`, marginBottom: 6, backgroundColor: "transparent", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: DS.fontMono, fontSize: "0.75rem", fontWeight: 700, transition: "background-color 0.15s" }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = DS.bgHover} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}>
                <span>{cap.description}</span>
                <span style={{ fontSize: "0.7rem" }}>{cap.pricing.amount} USDC</span>
              </button>
            ))}
          </div>

          {/* On-chain info */}
          {agent.onChain && (
            <div style={{ padding: "24px 30px", borderBottom: `1px solid ${DS.border}` }}>
              <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 12 }}>ON-CHAIN RECORD</span>
              {[
                ["STATUS", "VERIFIED"],
                ["NETWORK", "SOLANA DEVNET"],
                ["PROGRAM", "CgchXu...p1Vbc"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontFamily: DS.fontMono, fontSize: "0.7rem", fontWeight: 700 }}>
                  <span className="ds-muted-text">{k}</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>
          )}

          {/* Agent Card JSON */}
          <div style={{ padding: "24px 30px" }}>
            <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 12 }}>AGENT CARD (JSON)</span>
            <pre style={{ fontFamily: DS.fontMono, fontSize: "0.65rem", fontWeight: 700, backgroundColor: DS.bg, border: `1px solid ${DS.border}`, borderRadius: 6, padding: 12, overflowX: "auto", maxHeight: 220, overflowY: "auto", lineHeight: 1.5 }}>
              {JSON.stringify({ did: agent.did, name: agent.name, version: agent.version, endpoint: agent.endpoint, type: agent.type, capabilities: agent.capabilities, walletAddress: agent.walletAddress }, null, 2)}
            </pre>
          </div>
        </div>
      </div>

      {/* ═══ Ratings ═══ */}
      <div style={{ padding: "24px 30px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ ...bandLabel, color: DS.textMuted }}>RATINGS & REVIEWS</span>
          {ratings.count > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="ds-star" style={{ fontSize: "1rem" }}>{"★".repeat(Math.round(ratings.avg))}{"☆".repeat(5 - Math.round(ratings.avg))}</span>
              <span style={{ fontFamily: DS.fontPrimary, fontSize: "1rem", fontWeight: 400 }}>{ratings.avg.toFixed(1)}</span>
              <span className="ds-muted-text" style={{ ...bandLabel, fontSize: "0.6rem" }}>({ratings.count})</span>
            </div>
          )}
        </div>

        {/* Submit rating */}
        {address && !ratingSubmitted ? (
          <div style={{ border: `1px solid ${DS.border}`, padding: 20, marginBottom: 16 }}>
            <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 10 }}>RATE THIS AGENT</span>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 12 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setMyRating(n)} className="ds-star" style={{ fontSize: "1.8rem", background: "none", border: "none", cursor: "pointer", opacity: n <= myRating ? 1 : 0.2, transition: "opacity 0.15s" }}>
                  ★
                </button>
              ))}
              {myRating > 0 && <span className="ds-muted-text" style={{ fontFamily: DS.fontMono, fontSize: "0.7rem", marginLeft: 8 }}>{myRating}/5</span>}
            </div>
            <textarea value={myComment} onChange={(e) => setMyComment(e.target.value)} placeholder="Optional comment..." rows={2} style={{ width: "100%", fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, padding: "10px 14px", border: `1px solid ${DS.border}`, backgroundColor: "transparent", outline: "none", resize: "none", marginBottom: 12 }} />
            <button onClick={submitRating} disabled={myRating < 1} className="mp-white-text" style={{ ...btnDark, opacity: myRating < 1 ? 0.4 : 1, cursor: myRating < 1 ? "not-allowed" : "pointer" }}>
              SUBMIT RATING
            </button>
          </div>
        ) : ratingSubmitted ? (
          <p className="ds-accent-text" style={{ ...bandLabel, marginBottom: 16 }}>THANKS FOR YOUR RATING</p>
        ) : null}

        {/* Reviews */}
        {ratings.ratings.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {ratings.ratings.map((r, i) => (
              <div key={i} style={{ padding: "12px 0", borderBottom: i < ratings.ratings.length - 1 ? "1px solid #ccc" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span className="ds-star" style={{ fontSize: "0.9rem" }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                  <span className="ds-muted-text" style={{ fontFamily: DS.fontMono, fontSize: "0.65rem" }}>{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                {r.comment && <p style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, lineHeight: 1.4 }}>{r.comment}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ ...bandLabel, color: DS.textMuted, fontWeight: 400 }}>NO REVIEWS YET. BE THE FIRST TO RATE THIS AGENT.</p>
        )}
      </div>
    </div>
  );
}
