"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletStore } from "@/store/walletStore";
import { useLogStore } from "@/store/logStore";
import { signedFetch } from "@/lib/auth/signed-fetch";

const DS = {
  bg: "#e6e5e0",
  bgHover: "#d9d8d3",
  border: "#000000",
  text: "#000000",
  textMuted: "#666666",
  dark: "#222222",
  green: "#7cb342",
  error: "#c62828",
  purple: "#7c3aed",
  white: "#ffffff",
  fontPrimary: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  fontMono: '"Courier New", Courier, monospace',
};

const bandLabel: React.CSSProperties = { fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" };
const inputStyle: React.CSSProperties = { width: "100%", fontFamily: DS.fontMono, fontSize: "0.9rem", fontWeight: 700, padding: "12px 14px", border: `1px solid ${DS.border}`, backgroundColor: "transparent", outline: "none", color: DS.text };
const btnDark: React.CSSProperties = { padding: "12px 28px", fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", backgroundColor: DS.dark, color: DS.bg, border: "none", cursor: "pointer" };

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{ ...bandLabel, fontSize: "0.7rem", color: DS.textMuted, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
      {copied ? "COPIED" : "COPY"}
    </button>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { disconnect } = useWallet();
  const { address, did, usdcBalance } = useWalletStore();
  const { tasks } = useLogStore();

  const [solBalance, setSolBalance] = useState<string>("...");
  const [myAgentCount, setMyAgentCount] = useState(0);
  const [prefLang, setPrefLang] = useState("auto");
  const [prefDetail, setPrefDetail] = useState("medium");
  const [prefInstructions, setPrefInstructions] = useState("");
  const [prefsSaving, setPrefsSaving] = useState(false);

  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-profile-theme", "true");
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
      main.pt-14 .ds-error-text { color: ${DS.error} !important; }
      main.pt-14 .ds-muted-text { color: ${DS.textMuted} !important; }
      main.pt-14 input::placeholder { color: #555555 !important; }
      main.pt-14 select, main.pt-14 option { color: #000 !important; background-color: ${DS.bg} !important; }
      ::-webkit-scrollbar-track { background: ${DS.bg} !important; }
      ::-webkit-scrollbar-thumb { background: ${DS.textMuted} !important; }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  useEffect(() => {
    if (!address) return;
    fetch(`/api/wallet/balance?address=${address}&type=sol`).then((r) => r.json()).then((d) => setSolBalance(d.solBalance ?? "...")).catch(() => setSolBalance("..."));
    fetch(`/api/agent-card/my-agents?owner=${address}`).then((r) => r.json()).then((d) => setMyAgentCount(d.agents?.length ?? 0)).catch(() => {});
    signedFetch(`/api/preferences?wallet=${address}`).then((r) => r.json()).then((d) => { setPrefLang(d.language || "auto"); setPrefDetail(d.detail_level || "medium"); setPrefInstructions(d.custom_instructions || ""); }).catch(() => {});
  }, [address]);

  const savePrefs = async () => {
    if (!address) return;
    setPrefsSaving(true);
    await signedFetch("/api/preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet_address: address, language: prefLang, detail_level: prefDetail, custom_instructions: prefInstructions }) });
    setPrefsSaving(false);
  };

  const handleDisconnect = () => { disconnect(); router.push("/connect"); };

  if (!address) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 16, fontFamily: DS.fontPrimary }}>
        <p style={{ ...bandLabel, color: DS.textMuted }}>CONNECT YOUR WALLET TO VIEW PROFILE</p>
        <button onClick={() => router.push("/connect")} className="mp-white-text" style={btnDark}>Connect Wallet</button>
      </div>
    );
  }

  const totalTasks = tasks.length;
  const completed = tasks.filter((t) => t.state === "COMPLETED").length;
  const totalSpent = tasks.reduce((sum, t) => sum + parseFloat(t.usdcSpent || "0"), 0);

  return (
    <div style={{ width: "100%", maxWidth: 1920, margin: "0 auto", padding: "0 0 40px", fontFamily: DS.fontPrimary, WebkitFontSmoothing: "antialiased" }}>

      {/* Header */}
      <header style={{ padding: "40px 30px", borderBottom: `1px solid ${DS.border}` }}>
        <h2 style={{ fontSize: "4rem", fontWeight: 400, lineHeight: 0.95, textTransform: "uppercase", letterSpacing: "-0.02em", color: DS.text, fontFamily: DS.fontPrimary }}>Profile</h2>
      </header>

      {/* Balance band */}
      <div style={{ display: "flex", borderBottom: `1px solid ${DS.border}` }}>
        <div style={{ flex: 1, padding: "30px", borderRight: `1px solid ${DS.border}` }}>
          <span style={{ ...bandLabel, fontSize: "0.7rem", color: DS.textMuted, display: "block", marginBottom: 8 }}>USDC BALANCE</span>
          <span style={{ fontFamily: DS.fontPrimary, fontSize: "3.5rem", fontWeight: 400, lineHeight: 0.9 }}>{usdcBalance || "0.00"}</span>
          <span style={{ fontFamily: DS.fontMono, fontSize: "1rem", fontWeight: 700, marginLeft: 8, color: DS.textMuted }}>USDC</span>
        </div>
        <div style={{ flex: 1, padding: "30px" }}>
          <span style={{ ...bandLabel, fontSize: "0.7rem", color: DS.textMuted, display: "block", marginBottom: 8 }}>SOL BALANCE</span>
          <span style={{ fontFamily: DS.fontPrimary, fontSize: "3.5rem", fontWeight: 400, lineHeight: 0.9 }}>{solBalance}</span>
          <span style={{ fontFamily: DS.fontMono, fontSize: "1rem", fontWeight: 700, marginLeft: 8, color: DS.textMuted }}>SOL</span>
        </div>
      </div>

      {/* Stats band */}
      <div style={{ display: "flex", borderBottom: `1px solid ${DS.border}` }}>
        {[
          { label: "TOTAL TASKS", value: String(totalTasks) },
          { label: "COMPLETED", value: String(completed), color: DS.green },
          { label: "USDC SPENT", value: totalSpent.toFixed(2), color: DS.green },
          { label: "MY AGENTS", value: String(myAgentCount), color: DS.purple },
        ].map((s, i) => (
          <div key={s.label} style={{ flex: 1, padding: "16px 20px", borderRight: i < 3 ? `1px solid ${DS.border}` : "none", textAlign: "center" }}>
            <span style={{ fontFamily: DS.fontPrimary, fontSize: "1.8rem", fontWeight: 400, display: "block", color: s.color || DS.text }}>{s.value}</span>
            <span style={{ ...bandLabel, fontSize: "0.7rem", color: DS.textMuted }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Identity + Preferences grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: `1px solid ${DS.border}` }}>
        {/* Identity */}
        <div style={{ padding: "24px 30px", borderRight: `1px solid ${DS.border}` }}>
          <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 16 }}>IDENTITY</span>
          <div style={{ padding: "12px 0", borderBottom: "1px solid #ccc" }}>
            <span style={{ ...bandLabel, fontSize: "0.7rem", color: DS.textMuted, display: "block", marginBottom: 4 }}>WALLET ADDRESS</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: DS.fontMono, fontSize: "0.85rem", fontWeight: 700, wordBreak: "break-all" }}>{address}</span>
              <CopyBtn text={address} />
            </div>
          </div>
          <div style={{ padding: "12px 0" }}>
            <span style={{ ...bandLabel, fontSize: "0.7rem", color: DS.textMuted, display: "block", marginBottom: 4 }}>DID (DECENTRALIZED IDENTIFIER)</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, wordBreak: "break-all" }}>{did || "Not generated"}</span>
              {did && <CopyBtn text={did} />}
            </div>
          </div>
        </div>

        {/* Twin Preferences */}
        <div style={{ padding: "24px 30px" }}>
          <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 16 }}>TWIN PREFERENCES</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <span style={{ ...bandLabel, fontSize: "0.7rem", color: DS.textMuted, display: "block", marginBottom: 6 }}>RESPONSE LANGUAGE</span>
              <select value={prefLang} onChange={(e) => setPrefLang(e.target.value)} style={{ ...inputStyle, cursor: "pointer", appearance: "none", WebkitAppearance: "none" }}>
                <option value="auto">AUTO (MATCH INPUT)</option>
                <option value="tr">TURKISH</option>
                <option value="en">ENGLISH</option>
              </select>
            </div>
            <div>
              <span style={{ ...bandLabel, fontSize: "0.7rem", color: DS.textMuted, display: "block", marginBottom: 6 }}>DETAIL LEVEL</span>
              <select value={prefDetail} onChange={(e) => setPrefDetail(e.target.value)} style={{ ...inputStyle, cursor: "pointer", appearance: "none", WebkitAppearance: "none" }}>
                <option value="short">SHORT — CONCISE</option>
                <option value="medium">MEDIUM — BALANCED</option>
                <option value="detailed">DETAILED — COMPREHENSIVE</option>
              </select>
            </div>
            <div>
              <span style={{ ...bandLabel, fontSize: "0.7rem", color: DS.textMuted, display: "block", marginBottom: 6 }}>CUSTOM INSTRUCTIONS</span>
              <textarea value={prefInstructions} onChange={(e) => setPrefInstructions(e.target.value)} placeholder="e.g. I'm interested in DeFi and Solana ecosystem." rows={3} style={{ ...inputStyle, resize: "none" }} />
            </div>
            <button onClick={savePrefs} disabled={prefsSaving} className="mp-white-text" style={{ ...btnDark, alignSelf: "flex-start", opacity: prefsSaving ? 0.5 : 1 }}>
              {prefsSaving ? "SAVING..." : "SAVE PREFERENCES"}
            </button>
          </div>
        </div>
      </div>

      {/* Agent Memories */}
      <AgentMemories wallet={address} />

      {/* Quick Links */}
      <div style={{ padding: "24px 30px" }}>
        <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 16 }}>QUICK LINKS</span>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {[
            { label: "MY AGENTS", sub: `${myAgentCount} registered on-chain`, onClick: () => router.push("/my-agents") },
            { label: "MARKETPLACE", onClick: () => router.push("/marketplace") },
            { label: "TASK HISTORY", onClick: () => router.push("/log") },
          ].map((link) => (
            <button key={link.label} onClick={link.onClick} style={{ textAlign: "left", padding: "14px 0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", borderTop: "none", borderLeft: "none", borderRight: "none", borderBottom: "1px solid #ccc", cursor: "pointer", fontFamily: DS.fontMono, fontSize: "0.9rem", fontWeight: 700 }}>
              <div>
                <span>{link.label}</span>
                {link.sub && <span style={{ fontSize: "0.75rem", color: DS.textMuted, display: "block", marginTop: 2 }}>{link.sub}</span>}
              </div>
              <span style={{ color: DS.textMuted }}>→</span>
            </button>
          ))}
          <a href={`https://explorer.solana.com/address/${address}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{ textAlign: "left", padding: "14px 0", borderBottom: "1px solid #ccc", display: "flex", justifyContent: "space-between", alignItems: "center", textDecoration: "none", fontFamily: DS.fontMono, fontSize: "0.9rem", fontWeight: 700, color: DS.text }}>
            <span>SOLANA EXPLORER</span>
            <span style={{ color: DS.textMuted }}>↗</span>
          </a>
          <button onClick={handleDisconnect} style={{ textAlign: "left", padding: "14px 0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", cursor: "pointer", fontFamily: DS.fontMono, fontSize: "0.9rem", fontWeight: 700, color: DS.error, marginTop: 8 }} className="ds-error-text">
            <span>DISCONNECT WALLET</span>
            <span>X</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Agent Memories ─── */
interface MemoryEntry { id: string; agent_did: string; memory_type: string; content: string; created_at?: string; }

function AgentMemories({ wallet }: { wallet: string }) {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMemories = useCallback(() => {
    setLoading(true);
    signedFetch(`/api/memory?wallet=${wallet}`).then((r) => r.json()).then((d) => setMemories(d.memories ?? [])).catch(() => {}).finally(() => setLoading(false));
  }, [wallet]);

  useEffect(() => { loadMemories(); }, [loadMemories]);

  const handleDelete = async (id: string) => { await signedFetch(`/api/memory?id=${id}`, { method: "DELETE" }); loadMemories(); };
  const handleClearAll = async () => { await signedFetch(`/api/memory?wallet=${wallet}&all=true`, { method: "DELETE" }); loadMemories(); };

  const grouped = memories.reduce<Record<string, MemoryEntry[]>>((acc, m) => { (acc[m.agent_did] ??= []).push(m); return acc; }, {});

  const memoryColors: Record<string, string> = { preference: DS.green, fact: DS.purple };

  return (
    <div style={{ padding: "24px 30px", borderBottom: `1px solid ${DS.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: DS.textMuted }}>AGENT MEMORIES</span>
        {memories.length > 0 && (
          <button onClick={handleClearAll} className="ds-error-text" style={{ fontFamily: DS.fontMono, fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", background: "none", border: "none", cursor: "pointer" }}>CLEAR ALL</button>
        )}
      </div>

      {loading ? (
        <p style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, color: DS.textMuted }}>LOADING MEMORIES...</p>
      ) : memories.length === 0 ? (
        <p style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, color: DS.textMuted }}>No memories yet. Agents learn about your preferences as you interact.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {Object.entries(grouped).map(([agentDid, entries]) => (
            <div key={agentDid} style={{ border: `1px solid ${DS.border}` }}>
              <div style={{ padding: "10px 16px", backgroundColor: "#d5d0c8", borderBottom: `1px solid ${DS.border}`, fontFamily: DS.fontMono, fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase" }}>
                {agentDid.length > 30 ? agentDid.slice(0, 20) + "..." : agentDid}
              </div>
              <div style={{ padding: "12px 16px", maxHeight: 200, overflowY: "auto" }}>
                {entries.map((m) => (
                  <div key={m.id} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, padding: "6px 0", borderBottom: "1px solid #ddd" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
                      <span className="mp-white-text" style={{ fontSize: "0.6rem", padding: "2px 6px", backgroundColor: memoryColors[m.memory_type] || DS.textMuted, fontFamily: DS.fontMono, fontWeight: 700, textTransform: "uppercase", flexShrink: 0 }}>{m.memory_type}</span>
                      <span style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, lineHeight: 1.4 }}>{m.content}</span>
                    </div>
                    <button onClick={() => handleDelete(m.id)} className="ds-error-text" style={{ fontFamily: DS.fontMono, fontSize: "0.6rem", fontWeight: 700, background: "none", border: "none", cursor: "pointer", textTransform: "uppercase", opacity: 0.4, flexShrink: 0 }} onMouseEnter={(e) => e.currentTarget.style.opacity = "1"} onMouseLeave={(e) => e.currentTarget.style.opacity = "0.4"}>
                      DELETE
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
