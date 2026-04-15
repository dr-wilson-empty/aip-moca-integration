"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import { canonicalAgentDid } from "@/lib/identity/canonical-did";
import { useAgentRegistry, type AgentParams } from "@/hooks/useRegisterAgent";
import { useAgentStore } from "@/store/agentStore";
import type { MyAgentEntry } from "@/types/aip";
import AgentAnalytics from "./AgentAnalytics";
import AgentBudget from "./AgentBudget";

const DS = {
  bg: "#e6e5e0",
  bgHover: "#d9d8d3",
  border: "#000000",
  text: "#000000",
  textMuted: "#666666",
  dark: "#222222",
  green: "#7cb342",
  cyan: "#4dd0e1",
  purple: "#7c3aed",
  error: "#c62828",
  white: "#ffffff",
  fontPrimary: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  fontMono: '"Courier New", Courier, monospace',
};

interface CapabilityRow { id: string; description: string; amount: string; }
type View = "list" | "register" | "edit";

const bandLabel: React.CSSProperties = { fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" };
const inputStyle: React.CSSProperties = { width: "100%", fontFamily: DS.fontMono, fontSize: "0.9rem", fontWeight: 700, padding: "12px 14px", border: `1px solid ${DS.border}`, backgroundColor: "transparent", outline: "none", color: DS.text };
const btnDark: React.CSSProperties = { padding: "12px 28px", fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", backgroundColor: DS.dark, color: DS.bg, border: "none", cursor: "pointer" };
const btnOutline: React.CSSProperties = { ...btnDark, backgroundColor: "transparent", border: `1px solid ${DS.border}`, color: DS.text };
const btnSmall: React.CSSProperties = { fontFamily: DS.fontMono, fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", padding: "6px 14px", border: `1px solid ${DS.border}`, backgroundColor: "transparent", cursor: "pointer", color: DS.text };

function SourceBadge({ source }: { source: string }) {
  const map: Record<string, { bg: string }> = {
    hosted: { bg: DS.cyan },
    external: { bg: "#c08c4a" },
    ui: { bg: DS.purple },
  };
  const s = map[source] || { bg: DS.textMuted };
  const label = source === "ui" ? "ON-CHAIN" : source.toUpperCase();
  return <span className="mp-white-text" style={{ fontSize: "0.65rem", padding: "3px 10px", backgroundColor: s.bg, fontFamily: DS.fontMono, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>;
}

const ORCH_ID_PREFIX = "orch-";
function isDefaultOrchestrator(agentId: string): boolean {
  return agentId.startsWith(ORCH_ID_PREFIX);
}

export default function RegisterAgentForm({ onRegistered }: { onRegistered?: () => void }) {
  const { publicKey } = useWallet();
  const router = useRouter();
  const { register, update, deregister, loading, error } = useAgentRegistry();
  const { myAgents, myAgentsLoading, syncFromChain } = useAgentStore();

  const [view, setView] = useState<View>("list");
  const [editAgent, setEditAgent] = useState<MyAgentEntry | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txAction, setTxAction] = useState("");

  const [agentId, setAgentId] = useState("");
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [agentType, setAgentType] = useState(1);
  const [version, setVersion] = useState("1.0.0");
  const [capabilities, setCapabilities] = useState<CapabilityRow[]>([{ id: "", description: "", amount: "0.10" }]);
  const [agentStatus, setAgentStatus] = useState<Map<string, boolean>>(new Map());

  useEffect(() => { if (publicKey) syncFromChain(publicKey.toBase58()); }, [publicKey, syncFromChain]);

  // Fetch online/offline status
  useEffect(() => {
    fetch("/api/agent-card/status").then((r) => r.json()).then((d) => {
      const statusMap = new Map<string, boolean>();
      for (const a of d.agents ?? []) statusMap.set(a.did, a.online);
      setAgentStatus(statusMap);
    }).catch(() => {});
  }, [myAgents]);

  const handleRefresh = useCallback(() => { if (publicKey) syncFromChain(publicKey.toBase58()); }, [publicKey, syncFromChain]);

  const resetForm = () => { setAgentId(""); setName(""); setEndpoint(""); setAgentType(1); setVersion("1.0.0"); setCapabilities([{ id: "", description: "", amount: "0.10" }]); setEditAgent(null); };

  const startEdit = (agent: MyAgentEntry) => {
    setEditAgent(agent); setAgentId(agent.agentId); setName(agent.name); setEndpoint(agent.endpoint);
    setAgentType(agent.type === "LLM" ? 0 : agent.type === "Execution" ? 2 : 1); setVersion(agent.version);
    const caps = agent.capabilities.map((c) => ({ id: c.id, description: c.description, amount: c.pricing?.amount || "0.10" }));
    setCapabilities(caps.length ? caps : [{ id: "", description: "", amount: "0.10" }]); setView("edit");
  };

  const startRegister = () => { resetForm(); setView("register"); };

  const addCapability = () => setCapabilities([...capabilities, { id: "", description: "", amount: "0.10" }]);
  const removeCapability = (idx: number) => setCapabilities(capabilities.filter((_, i) => i !== idx));
  const updateCapability = (idx: number, field: keyof CapabilityRow, value: string) => { const u = [...capabilities]; u[idx] = { ...u[idx], [field]: value }; setCapabilities(u); };

  const isValid = (view === "register" ? agentId.trim().length > 0 : true) && name.trim() && endpoint.trim() && publicKey && capabilities.length > 0 && capabilities.every((c) => c.id.trim() && c.description.trim() && parseFloat(c.amount) > 0);

  const buildParams = (): AgentParams => ({
    agentId: (editAgent?.agentId || agentId).trim().toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    name: name.trim(), endpoint: endpoint.trim(), agentType, walletAddress: publicKey!.toBase58(),
    version: version.trim() || "1.0.0",
    capabilities: capabilities.map((c) => ({ id: c.id.trim(), description: c.description.trim(), pricing: { amount: c.amount, token: "USDC", network: "solana" } })),
  });

  const trackUIRegistration = async (did: string, owner: string, agId: string) => {
    try { await fetch("/api/agent-card/my-agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ did, owner, agentId: agId }) }); } catch {}
  };

  const handleRegister = async () => {
    if (!isValid || !publicKey) return;
    const params = buildParams();
    const sig = await register(params);
    if (sig) { const ownerAddr = publicKey.toBase58(); const did = canonicalAgentDid(ownerAddr, params.agentId); await trackUIRegistration(did, ownerAddr, params.agentId); setTxHash(sig); setTxAction("registered"); syncFromChain(ownerAddr); onRegistered?.(); }
  };

  const handleUpdate = async () => {
    if (!isValid || !editAgent || !publicKey) return;
    const sig = await update(buildParams());
    if (sig) { setTxHash(sig); setTxAction("updated"); syncFromChain(publicKey.toBase58()); onRegistered?.(); }
  };

  const handleDeregister = async (id: string) => {
    if (!publicKey) return;
    const sig = await deregister(id);
    if (sig) { setTxHash(sig); setTxAction("deregistered"); syncFromChain(publicKey.toBase58()); onRegistered?.(); }
  };

  const handleDeleteHosted = async (id: string) => {
    if (!publicKey) return;
    try { const res = await fetch(`/api/hosted-agent/register?agentId=${id}&owner=${publicKey.toBase58()}`, { method: "DELETE" }); if (res.ok) syncFromChain(publicKey.toBase58()); } catch {}
  };

  if (!publicKey) {
    return <div style={{ padding: "40px 30px" }}><p style={{ ...bandLabel, color: DS.textMuted }}>CONNECT YOUR WALLET TO MANAGE AGENTS</p></div>;
  }

  /* Success */
  if (txHash) {
    return (
      <div style={{ padding: "40px 30px" }}>
        <p className="ds-accent-text" style={{ ...bandLabel, marginBottom: 8 }}>AGENT {txAction.toUpperCase()}</p>
        <a href={`https://explorer.solana.com/tx/${txHash}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, color: DS.text, wordBreak: "break-all", display: "block", marginBottom: 16 }}>{txHash}</a>
        <button onClick={() => { setTxHash(null); setTxAction(""); setView("list"); }} style={btnOutline}>BACK TO MY AGENTS</button>
      </div>
    );
  }

  /* ═══ LIST VIEW ═══ */
  if (view === "list") {
    return (
      <div>
        {/* Actions bar */}
        <div style={{ padding: "14px 30px", borderBottom: `1px solid ${DS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#d5d0c8" }}>
          <span style={bandLabel}>MY AGENTS</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={handleRefresh} disabled={myAgentsLoading} style={{ ...btnSmall, opacity: myAgentsLoading ? 0.5 : 1 }}>{myAgentsLoading ? "SYNCING..." : "REFRESH"}</button>
            <button onClick={() => router.push("/create-agent")} className="mp-white-text" style={{ ...btnSmall, backgroundColor: DS.dark, border: "none" }}>+ NO-CODE</button>
            <button onClick={startRegister} style={btnSmall}>+ SDK</button>
          </div>
        </div>

        {myAgentsLoading ? (
          <div style={{ padding: "40px 30px" }}><span style={{ ...bandLabel, color: DS.textMuted }}>LOADING AGENTS FROM CHAIN...</span></div>
        ) : myAgents.length === 0 && !myAgentsLoading ? (
          <div style={{ padding: "60px 30px", textAlign: "center" }}>
            <p style={{ ...bandLabel, color: DS.textMuted, marginBottom: 20 }}>NO AGENTS YET</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button onClick={() => router.push("/create-agent")} className="mp-white-text" style={btnDark}>CREATE WITH NO-CODE</button>
              <button onClick={startRegister} style={btnOutline}>REGISTER WITH SDK</button>
            </div>
          </div>
        ) : (
          <div>
            {[...myAgents].sort((a, b) => {
              const aOrch = isDefaultOrchestrator(a.agentId) ? 0 : 1;
              const bOrch = isDefaultOrchestrator(b.agentId) ? 0 : 1;
              return aOrch - bOrch;
            }).map((agent) => {
              const isOrch = isDefaultOrchestrator(agent.agentId);
              return (
              <div key={agent.agentId} style={{ borderBottom: `1px solid ${DS.border}`, padding: "20px 30px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, backgroundColor: isOrch ? "#d5d0c8" : "transparent" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Name + badge */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <h3 style={{ fontFamily: DS.fontPrimary, fontSize: "1.3rem", fontWeight: 400, textTransform: "uppercase" }}>{agent.name}</h3>
                    {isOrch && <span className="mp-white-text" style={{ fontSize: "0.65rem", padding: "3px 10px", backgroundColor: DS.green, fontFamily: DS.fontMono, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>DEFAULT</span>}
                    {agent.isPublic === false && <span style={{ fontSize: "0.65rem", padding: "3px 10px", backgroundColor: DS.textMuted, color: DS.white, fontFamily: DS.fontMono, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>PRIVATE</span>}
                    <SourceBadge source={agent.registrationSource} />
                    {/* Online/Offline */}
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: agentStatus.get(agent.did) === true ? DS.green : agentStatus.get(agent.did) === false ? DS.error : "#bbb", display: "inline-block", boxShadow: agentStatus.get(agent.did) === true ? `0 0 4px ${DS.green}` : "none" }} />
                      <span style={{ fontFamily: DS.fontMono, fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", color: DS.textMuted }}>
                        {agentStatus.get(agent.did) === true ? "ONLINE" : agentStatus.get(agent.did) === false ? "OFFLINE" : "..."}
                      </span>
                    </span>
                  </div>
                  <p style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, color: DS.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{agent.endpoint}</p>
                  <p className="ds-muted-text" style={{ fontFamily: DS.fontMono, fontSize: "0.75rem", marginTop: 2 }}>ID: {agent.agentId}</p>

                  {agent.onChainPDA && (
                    <a href={`https://explorer.solana.com/address/${agent.onChainPDA}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: DS.fontMono, fontSize: "0.75rem", fontWeight: 700, color: DS.text, textDecoration: "underline", display: "inline-block", marginTop: 4 }}>
                      PDA: {agent.onChainPDA.slice(0, 8)}...{agent.onChainPDA.slice(-6)}
                    </a>
                  )}

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                    {agent.capabilities.map((c) => (
                      <span key={c.id} style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700 }}>
                        {c.description} <span className="ds-accent-text">{c.pricing?.amount || "?"} USDC</span>
                      </span>
                    ))}
                  </div>

                  <AgentAnalytics did={agent.did} />
                  {isOrch && <AgentBudget agentDid={agent.did} />}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                  {agent.registrationSource !== "hosted" && (
                    <button onClick={() => startEdit(agent)} style={btnSmall}>
                      {agent.registrationSource === "external" ? "CLAIM" : "EDIT"}
                    </button>
                  )}
                  {!isOrch && (
                    <button onClick={() => agent.registrationSource === "hosted" ? handleDeleteHosted(agent.agentId) : handleDeregister(agent.agentId)} disabled={loading} className="ds-error-text" style={{ ...btnSmall, borderColor: DS.error }}>
                      {loading ? "..." : "DELETE"}
                    </button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  /* ═══ REGISTER / EDIT FORM ═══ */
  return (
    <div>
      <div style={{ padding: "14px 30px", borderBottom: `1px solid ${DS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#d5d0c8" }}>
        <span style={bandLabel}>{view === "edit" ? `EDIT: ${editAgent?.name}` : "REGISTER NEW AGENT"}</span>
        <button onClick={() => { resetForm(); setView("list"); }} style={btnSmall}>BACK</button>
      </div>

      {/* Agent ID */}
      {view === "register" && (
        <div style={{ padding: "16px 30px", borderBottom: `1px solid ${DS.border}` }}>
          <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 8 }}>AGENT ID (SLUG, CANNOT BE CHANGED)</span>
          <input type="text" value={agentId} onChange={(e) => setAgentId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} placeholder="my-summary-bot" maxLength={32} style={inputStyle} />
          <span className="ds-muted-text" style={{ fontFamily: DS.fontMono, fontSize: "0.7rem", display: "block", marginTop: 4 }}>Lowercase letters, numbers, hyphens. Max 32 chars.</span>
        </div>
      )}

      {/* Name */}
      <div style={{ padding: "16px 30px", borderBottom: `1px solid ${DS.border}` }}>
        <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 8 }}>AGENT NAME</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Agent" maxLength={64} style={inputStyle} />
      </div>

      {/* Endpoint */}
      <div style={{ padding: "16px 30px", borderBottom: `1px solid ${DS.border}` }}>
        <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 8 }}>ENDPOINT URL</span>
        <input type="text" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="http://localhost:4004/a2a" maxLength={200} style={inputStyle} />
      </div>

      {/* Type + Version */}
      <div style={{ display: "flex", borderBottom: `1px solid ${DS.border}` }}>
        <div style={{ flex: 1, padding: "16px 30px", borderRight: `1px solid ${DS.border}` }}>
          <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 8 }}>TYPE</span>
          <select value={agentType} onChange={(e) => setAgentType(Number(e.target.value))} style={{ ...inputStyle, cursor: "pointer", appearance: "none", WebkitAppearance: "none" }}>
            <option value={0}>LLM</option>
            <option value={1}>TASK</option>
            <option value={2}>EXECUTION</option>
          </select>
        </div>
        <div style={{ flex: 1, padding: "16px 30px" }}>
          <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 8 }}>VERSION</span>
          <input type="text" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0.0" maxLength={16} style={inputStyle} />
        </div>
      </div>

      {/* Capabilities */}
      <div style={{ padding: "16px 30px", borderBottom: `1px solid ${DS.border}` }}>
        <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 12 }}>CAPABILITIES</span>
        {capabilities.map((cap, idx) => (
          <div key={idx} style={{ border: `1px solid ${DS.border}`, marginBottom: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
              <div style={{ padding: "12px 14px", borderRight: `1px solid ${DS.border}`, borderBottom: `1px solid ${DS.border}` }}>
                <span style={{ ...bandLabel, fontSize: "0.7rem", color: DS.textMuted, display: "block", marginBottom: 6 }}>CAPABILITY ID</span>
                <input type="text" value={cap.id} onChange={(e) => updateCapability(idx, "id", e.target.value)} placeholder="text.summarize" style={{ ...inputStyle, padding: "8px 10px", fontSize: "0.85rem" }} />
              </div>
              <div style={{ padding: "12px 14px", borderBottom: `1px solid ${DS.border}` }}>
                <span style={{ ...bandLabel, fontSize: "0.7rem", color: DS.textMuted, display: "block", marginBottom: 6 }}>DISPLAY NAME</span>
                <input type="text" value={cap.description} onChange={(e) => updateCapability(idx, "description", e.target.value)} placeholder="Summarize Text" style={{ ...inputStyle, padding: "8px 10px", fontSize: "0.85rem" }} />
              </div>
            </div>
            <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ ...bandLabel, fontSize: "0.7rem", color: DS.textMuted }}>PRICE:</span>
                <input type="number" step="0.01" min="0.01" value={cap.amount} onChange={(e) => updateCapability(idx, "amount", e.target.value)} style={{ ...inputStyle, width: 80, padding: "8px 10px", fontSize: "0.85rem", textAlign: "center" }} />
                <span style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700 }}>USDC</span>
              </div>
              {capabilities.length > 1 && (
                <button onClick={() => removeCapability(idx)} className="ds-error-text" style={{ fontFamily: DS.fontMono, fontSize: "0.7rem", fontWeight: 700, background: "none", border: "none", cursor: "pointer", textTransform: "uppercase" }}>REMOVE</button>
              )}
            </div>
          </div>
        ))}
        <button onClick={addCapability} className="ds-accent-text" style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, background: "none", border: "none", cursor: "pointer", textTransform: "uppercase", marginTop: 4 }}>+ ADD CAPABILITY</button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: "12px 30px", borderBottom: `1px solid ${DS.border}`, backgroundColor: "#f5e6e6" }}>
          <span className="ds-error-text" style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700 }}>{error}</span>
        </div>
      )}

      {/* Submit */}
      <div style={{ padding: "20px 30px" }}>
        <button onClick={view === "edit" ? handleUpdate : handleRegister} disabled={!isValid || loading} className="mp-white-text" style={{ ...btnDark, opacity: !isValid || loading ? 0.4 : 1, cursor: !isValid || loading ? "not-allowed" : "pointer" }}>
          {loading ? "SIGNING..." : view === "edit" ? "UPDATE ON-CHAIN" : "REGISTER ON-CHAIN"}
        </button>
      </div>
    </div>
  );
}
