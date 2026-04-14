"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWalletStore } from "@/store/walletStore";
import { signedFetch } from "@/lib/auth/signed-fetch";
import ArtifactRenderer, { parseArtifact } from "@/components/ui/ArtifactRenderer";

/* ─── Types ─── */
interface Automation {
  id: string;
  name: string;
  prompt: string;
  schedule: string;
  budget_limit: number;
  budget_period: string;
  enabled: boolean;
  last_run?: string;
  total_spent: number;
  run_count: number;
  trigger_type: "schedule" | "webhook" | "onchain";
  webhook_secret?: string;
  watch_address?: string;
}

interface AutoResult {
  id: string;
  agent_name: string;
  capability: string;
  input: string;
  artifact: string;
  estimated_cost: string;
  status: string;
  created_at: string;
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
  error: "#c62828",
  purple: "#7c3aed",
  white: "#ffffff",
  fontPrimary: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  fontMono: '"Courier New", Courier, monospace',
};

const TRIGGER_COLORS: Record<string, { bg: string; text: string }> = {
  schedule: { bg: DS.text, text: DS.white },
  webhook: { bg: DS.green, text: DS.white },
  onchain: { bg: DS.purple, text: DS.white },
};

export default function AutomationsPage() {
  const router = useRouter();
  const { address } = useWalletStore();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, AutoResult[]>>({});
  const [runningId, setRunningId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [schedule, setSchedule] = useState("daily");
  const [budgetLimit, setBudgetLimit] = useState("1.00");
  const [budgetPeriod, setBudgetPeriod] = useState("daily");
  const [triggerType, setTriggerType] = useState<"schedule" | "webhook" | "onchain">("schedule");
  const [watchAddress, setWatchAddress] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [testingWebhook, setTestingWebhook] = useState<string | null>(null);

  /* Theme override */
  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-auto-theme", "true");
    style.textContent = `
      body { background-color: ${DS.bg} !important; color: ${DS.text} !important; }
      main.pt-14 { padding-top: 56px; }
      nav[aria-label="Main navigation"] {
        background-color: ${DS.bg} !important;
        
        backdrop-filter: none !important; -webkit-backdrop-filter: none !important;
      }
      nav[aria-label="Main navigation"] a, nav[aria-label="Main navigation"] span {
        color: ${DS.text} !important; font-family: ${DS.fontMono} !important;
      }
      nav[aria-label="Main navigation"] a:hover { color: ${DS.textMuted} !important; }
      nav[aria-label="Main navigation"] a[aria-current="page"] { color: ${DS.text} !important; font-weight: 700 !important; }
      nav[aria-label="Main navigation"] .w-2.h-2 { background-color: ${DS.green} !important; }
      nav[aria-label="Main navigation"] .w-px { background-color: ${DS.border} !important; opacity: 0.2; }
      main.pt-14 * { color: #000000 !important; }
      main.pt-14 input::placeholder { color: #555555 !important; }
      main.pt-14 .mp-white-text { color: #ffffff !important; }
      main.pt-14 .ds-accent-text { color: ${DS.green} !important; }
      main.pt-14 .ds-error-text { color: ${DS.error} !important; }
      main.pt-14 .ds-muted-text { color: ${DS.textMuted} !important; }
      main.pt-14 select, main.pt-14 option { color: #000 !important; background-color: ${DS.bg} !important; }
      ::-webkit-scrollbar-track { background: ${DS.bg} !important; }
      ::-webkit-scrollbar-thumb { background: ${DS.textMuted} !important; }
      .auto-card { transition: background-color 0.15s ease; }
      .auto-card:hover { background-color: ${DS.bgHover} !important; }
      .auto-hero-header::after {
        content: "AUTOMATIONS";
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

  const loadAutomations = useCallback(() => {
    if (!address) return;
    setLoading(true);
    signedFetch(`/api/automations?wallet=${address}`)
      .then((r) => r.json())
      .then((d) => setAutomations(d.automations ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [address]);

  useEffect(() => { loadAutomations(); }, [loadAutomations]);

  const loadResults = async (autoId: string) => {
    const res = await signedFetch(`/api/automations/results?automationId=${autoId}`);
    const data = await res.json();
    setResults((prev) => ({ ...prev, [autoId]: data.results ?? [] }));
  };

  const handleCreate = async () => {
    if (!address || !name.trim() || !prompt.trim()) return;
    await signedFetch("/api/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletAddress: address, name: name.trim(), prompt: prompt.trim(),
        schedule, budgetLimit: parseFloat(budgetLimit), budgetPeriod, triggerType,
        watchAddress: triggerType === "onchain" ? watchAddress.trim() : undefined,
      }),
    });
    setName(""); setPrompt(""); setTriggerType("schedule"); setWatchAddress(""); setShowForm(false);
    loadAutomations();
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await signedFetch("/api/automations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, enabled }) });
    loadAutomations();
  };

  const handleDelete = async (id: string) => {
    await signedFetch(`/api/automations?id=${id}`, { method: "DELETE" });
    loadAutomations();
  };

  const handleRun = async (id: string) => {
    setRunningId(id);
    try {
      const res = await signedFetch("/api/automations/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ automationId: id }) });
      const data = await res.json();
      if (!res.ok) alert(data.error || "Run failed");
      loadAutomations();
      loadResults(id);
      setExpandedId(id);
    } catch (err) { alert(err instanceof Error ? err.message : "Run failed"); }
    setRunningId(null);
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) { setExpandedId(null); }
    else { setExpandedId(id); if (!results[id]) loadResults(id); }
  };

  /* ─── Shared styles ─── */
  const bandLabel: React.CSSProperties = { fontFamily: DS.fontMono, fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" };
  const inputStyle: React.CSSProperties = { width: "100%", fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, padding: "10px 14px", border: `1px solid ${DS.border}`, backgroundColor: "transparent", outline: "none", color: DS.text };
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer", appearance: "none", WebkitAppearance: "none" };
  const btnDark: React.CSSProperties = { padding: "10px 24px", fontFamily: DS.fontMono, fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", backgroundColor: DS.dark, color: DS.bg, border: "none", cursor: "pointer" };
  const btnOutline: React.CSSProperties = { ...btnDark, backgroundColor: "transparent", border: `1px solid ${DS.border}`, color: DS.text };
  const btnSmall: React.CSSProperties = { fontFamily: DS.fontMono, fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", padding: "6px 14px", border: `1px solid ${DS.border}`, backgroundColor: "transparent", cursor: "pointer", color: DS.text };

  if (!address) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 16, fontFamily: DS.fontPrimary }}>
        <p style={{ ...bandLabel, color: DS.textMuted }}>CONNECT YOUR WALLET TO USE AUTOMATIONS</p>
        <button onClick={() => router.push("/connect")} className="mp-white-text" style={btnDark}>Connect Wallet</button>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", maxWidth: 1920, margin: "0 auto", padding: "0 0 40px", fontFamily: DS.fontPrimary, WebkitFontSmoothing: "antialiased" }}>

      {/* ═══ Header ═══ */}
      <header className="auto-hero-header" style={{ padding: "30px 40px 0", borderBottom: `1px solid ${DS.border}`, position: "relative", overflow: "hidden", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <h2 style={{ position: "relative", zIndex: 1, fontSize: "8rem", fontWeight: 300, lineHeight: 0.85, textTransform: "uppercase", letterSpacing: "-0.03em", color: DS.text, fontFamily: DS.fontPrimary, textShadow: "3px 3px 0px #d5d0c8", margin: 0, marginBottom: -6 }}>
          Auto
        </h2>
        <button onClick={() => setShowForm(!showForm)} className={showForm ? "" : "mp-white-text"} style={{ ...showForm ? btnOutline : btnDark, position: "relative", zIndex: 1, marginBottom: 8 }}>
          {showForm ? "CANCEL" : "+ NEW AUTOMATION"}
        </button>
      </header>

      {/* ═══ Create Form ═══ */}
      {showForm && (
        <div style={{ borderBottom: `1px solid ${DS.border}` }}>
          {/* Form header */}
          <div style={{ padding: "12px 30px", borderBottom: `1px solid ${DS.border}`, backgroundColor: "#d5d0c8", ...bandLabel }}>
            NEW AUTOMATION
          </div>

          {/* Name */}
          <div style={{ padding: "16px 30px", borderBottom: `1px solid ${DS.border}` }}>
            <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 8 }}>NAME</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Daily DeFi Report" style={inputStyle} />
          </div>

          {/* Prompt */}
          <div style={{ padding: "16px 30px", borderBottom: `1px solid ${DS.border}` }}>
            <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 8 }}>PROMPT (WHAT SHOULD TWIN DO?)</span>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Get a DeFi risk analysis for the top Solana protocols" rows={2} style={{ ...inputStyle, resize: "none" }} />
          </div>

          {/* Trigger Type */}
          <div style={{ padding: "16px 30px", borderBottom: `1px solid ${DS.border}` }}>
            <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 8 }}>TRIGGER TYPE</span>
            <div style={{ display: "flex", gap: 0 }}>
              {(["schedule", "webhook", "onchain"] as const).map((t) => (
                <button key={t} onClick={() => setTriggerType(t)} className={triggerType === t ? "mp-white-text" : ""} style={{
                  flex: 1, padding: "10px 16px", fontFamily: DS.fontMono, fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase",
                  backgroundColor: triggerType === t ? TRIGGER_COLORS[t].bg : "transparent",
                  color: triggerType === t ? TRIGGER_COLORS[t].text : DS.textMuted,
                  border: `1px solid ${DS.border}`, borderRight: t !== "onchain" ? "none" : `1px solid ${DS.border}`, cursor: "pointer",
                }}>
                  {t === "schedule" ? "SCHEDULE (CRON)" : t === "webhook" ? "WEBHOOK (EXTERNAL)" : "ON-CHAIN (SOLANA)"}
                </button>
              ))}
            </div>
          </div>

          {/* Config row */}
          <div style={{ display: "flex", borderBottom: `1px solid ${DS.border}` }}>
            <div style={{ flex: 1, padding: "16px 30px", borderRight: `1px solid ${DS.border}` }}>
              <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 8 }}>
                {triggerType === "schedule" ? "SCHEDULE" : triggerType === "onchain" ? "WATCH ADDRESS (SOLANA)" : "TRIGGER"}
              </span>
              {triggerType === "schedule" ? (
                <select value={schedule} onChange={(e) => setSchedule(e.target.value)} style={selectStyle}>
                  <option value="2min">EVERY 2 MIN</option>
                  <option value="5min">EVERY 5 MIN</option>
                  <option value="hourly">HOURLY</option>
                  <option value="daily">DAILY</option>
                  <option value="weekly">WEEKLY</option>
                </select>
              ) : triggerType === "onchain" ? (
                <input type="text" value={watchAddress} onChange={(e) => setWatchAddress(e.target.value)} placeholder="33qU3JFk..." style={inputStyle} />
              ) : (
                <div style={{ ...inputStyle, border: "none", color: DS.textMuted, fontSize: "0.75rem" }}>Webhook URL will be generated</div>
              )}
            </div>
            <div style={{ flex: 1, padding: "16px 30px", borderRight: `1px solid ${DS.border}` }}>
              <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 8 }}>BUDGET LIMIT (USDC)</span>
              <input type="number" step="0.1" min="0.1" value={budgetLimit} onChange={(e) => setBudgetLimit(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1, padding: "16px 30px" }}>
              <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 8 }}>BUDGET PERIOD</span>
              <select value={budgetPeriod} onChange={(e) => setBudgetPeriod(e.target.value)} style={selectStyle}>
                <option value="daily">PER DAY</option>
                <option value="weekly">PER WEEK</option>
                <option value="monthly">PER MONTH</option>
              </select>
            </div>
          </div>

          {/* Create button */}
          <div style={{ padding: "16px 30px", borderBottom: `1px solid ${DS.border}` }}>
            <button onClick={handleCreate} disabled={!name.trim() || !prompt.trim()} className="mp-white-text" style={{ ...btnDark, opacity: !name.trim() || !prompt.trim() ? 0.4 : 1, cursor: !name.trim() || !prompt.trim() ? "not-allowed" : "pointer" }}>
              CREATE AUTOMATION
            </button>
          </div>
        </div>
      )}

      {/* ═══ Automations List ═══ */}
      {loading ? (
        <div style={{ padding: "60px 30px", textAlign: "center" }}>
          <span style={{ ...bandLabel, color: DS.textMuted }}>LOADING AUTOMATIONS...</span>
        </div>
      ) : automations.length === 0 && !showForm ? (
        <div style={{ padding: "80px 30px", textAlign: "center" }}>
          <p style={{ ...bandLabel, color: DS.textMuted, marginBottom: 20 }}>NO AUTOMATIONS YET</p>
          <button onClick={() => setShowForm(true)} className="mp-white-text" style={btnDark}>CREATE YOUR FIRST AUTOMATION</button>
        </div>
      ) : (
        <div>
          {automations.map((auto) => {
            const tc = TRIGGER_COLORS[auto.trigger_type] || TRIGGER_COLORS.schedule;
            return (
              <div key={auto.id} style={{ borderBottom: `1px solid ${DS.border}` }}>
                {/* ── Automation Header Row ── */}
                <div className="auto-card" style={{ padding: "16px 30px", display: "flex", alignItems: "flex-start", gap: 16 }}>
                  <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => toggleExpand(auto.id)}>
                    {/* Name + badges */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: auto.enabled ? DS.green : "#bbb", display: "inline-block", flexShrink: 0 }} />
                      <h3 style={{ fontFamily: DS.fontPrimary, fontSize: "1.4rem", fontWeight: 400, textTransform: "uppercase", color: DS.text }}>{auto.name}</h3>
                      <span className="mp-white-text" style={{ fontSize: "0.6rem", padding: "3px 10px", backgroundColor: tc.bg, fontFamily: DS.fontMono, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>
                        {auto.trigger_type === "webhook" ? "WEBHOOK" : auto.trigger_type === "onchain" ? "ON-CHAIN" : auto.schedule}
                      </span>
                    </div>

                    {/* Prompt */}
                    <p style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, color: DS.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{auto.prompt}</p>

                    {/* Webhook info */}
                    {auto.trigger_type === "webhook" && (
                      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ ...bandLabel, fontSize: "0.7rem", color: DS.textMuted }}>URL:</span>
                          <code style={{ fontFamily: DS.fontMono, fontSize: "0.75rem", fontWeight: 700, backgroundColor: "#d5d0c8", padding: "3px 8px" }}>
                            {typeof window !== "undefined" ? window.location.origin : ""}/api/trigger/{auto.id}
                          </code>
                          <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`${window.location.origin}/api/trigger/${auto.id}`); setCopiedId(auto.id + "_url"); setTimeout(() => setCopiedId(null), 2000); }} style={{ ...bandLabel, fontSize: "0.7rem", color: DS.textMuted, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                            {copiedId === auto.id + "_url" ? "COPIED" : "COPY"}
                          </button>
                          <button onClick={async (e) => { e.stopPropagation(); setTestingWebhook(auto.id); try { const crypto = await import("crypto"); const payload = JSON.stringify({ test: true, timestamp: new Date().toISOString() }); const sig = crypto.createHmac("sha256", auto.webhook_secret || "").update(payload).digest("hex"); await fetch(`/api/trigger/${auto.id}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Signature": `sha256=${sig}` }, body: payload }); loadAutomations(); } catch {} setTestingWebhook(null); }} className="ds-accent-text" style={btnSmall}>
                            {testingWebhook === auto.id ? "TESTING..." : "TEST"}
                          </button>
                        </div>
                        {auto.webhook_secret && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ ...bandLabel, fontSize: "0.7rem", color: DS.textMuted }}>SECRET:</span>
                            <code style={{ fontFamily: DS.fontMono, fontSize: "0.75rem", color: DS.textMuted, backgroundColor: "#d5d0c8", padding: "3px 8px" }}>
                              {auto.webhook_secret.slice(0, 12)}...
                            </code>
                            <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(auto.webhook_secret!); setCopiedId(auto.id + "_secret"); setTimeout(() => setCopiedId(null), 2000); }} style={{ ...bandLabel, fontSize: "0.7rem", color: DS.textMuted, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                              {copiedId === auto.id + "_secret" ? "COPIED" : "COPY"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* On-chain watch */}
                    {auto.trigger_type === "onchain" && auto.watch_address && (
                      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ ...bandLabel, fontSize: "0.7rem", color: DS.textMuted }}>WATCHING:</span>
                        <code style={{ fontFamily: DS.fontMono, fontSize: "0.75rem", fontWeight: 700, backgroundColor: "#d5d0c8", padding: "3px 8px" }}>
                          {auto.watch_address.slice(0, 8)}...{auto.watch_address.slice(-6)}
                        </code>
                        <span style={{ ...bandLabel, fontSize: "0.65rem", color: DS.textMuted, fontWeight: 400 }}>USDC TRANSFERS</span>
                      </div>
                    )}

                    {/* Stats */}
                    <div style={{ display: "flex", gap: 24, marginTop: 10, ...bandLabel, fontSize: "0.8rem", color: DS.textMuted, fontWeight: 400 }}>
                      <span>BUDGET: <strong style={{ fontWeight: 700 }}>{auto.total_spent.toFixed(2)}</strong> / {auto.budget_limit.toFixed(2)} USDC</span>
                      <span>RUNS: <strong style={{ fontWeight: 700 }}>{auto.run_count}</strong></span>
                      {auto.last_run && <span>LAST: {new Date(auto.last_run).toLocaleString()}</span>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => handleRun(auto.id)} disabled={runningId === auto.id || !auto.enabled} className="mp-white-text" style={{ ...btnSmall, backgroundColor: DS.dark, color: DS.bg, border: "none", opacity: runningId === auto.id || !auto.enabled ? 0.4 : 1, cursor: runningId === auto.id || !auto.enabled ? "not-allowed" : "pointer" }}>
                      {runningId === auto.id ? "RUNNING..." : "RUN NOW"}
                    </button>
                    <button onClick={() => handleToggle(auto.id, !auto.enabled)} className={auto.enabled ? "ds-accent-text" : ""} style={{ ...btnSmall, borderColor: auto.enabled ? DS.green : "#bbb" }}>
                      {auto.enabled ? "ENABLED" : "DISABLED"}
                    </button>
                    <button onClick={() => handleDelete(auto.id)} className="ds-error-text" style={{ ...btnSmall, borderColor: DS.error }}>
                      DELETE
                    </button>
                  </div>
                </div>

                {/* ── Expanded Results ── */}
                {expandedId === auto.id && (
                  <div style={{ borderTop: `1px solid ${DS.border}`, padding: "16px 30px", backgroundColor: "#dddcd7" }}>
                    <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 12 }}>RECENT RESULTS</span>
                    {!results[auto.id] || results[auto.id].length === 0 ? (
                      <p style={{ fontFamily: DS.fontMono, fontSize: "0.75rem", fontWeight: 700, color: DS.textMuted }}>No results yet. Click RUN NOW to execute.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {results[auto.id].map((r) => (
                          <div key={r.id} style={{ border: `1px solid ${DS.border}`, borderRadius: 8, backgroundColor: DS.bg, overflow: "hidden" }}>
                            <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: r.artifact ? `1px solid ${DS.border}` : "none" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: r.status === "completed" ? DS.green : DS.error, display: "inline-block" }} />
                                <span style={{ fontFamily: DS.fontMono, fontSize: "0.85rem", fontWeight: 700 }}>{r.agent_name} — {r.capability}</span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <span style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700 }}>{r.estimated_cost} USDC</span>
                                <span className="ds-muted-text" style={{ fontFamily: DS.fontMono, fontSize: "0.7rem" }}>{new Date(r.created_at).toLocaleString()}</span>
                              </div>
                            </div>
                            {r.artifact && (
                              <div style={{ padding: "16px", maxHeight: 300, overflowY: "auto", fontSize: "0.95rem", lineHeight: 1.6 }}>
                                <ArtifactRenderer artifact={parseArtifact(r.artifact)} />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
