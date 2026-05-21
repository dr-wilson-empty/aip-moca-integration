"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWalletStore } from "@/store/walletStore";
import { useAgentBuilderStore, type BuilderStep } from "@/store/agentBuilderStore";
import { useAgentRegistry } from "@/hooks/useRegisterAgent";
import { signedFetch } from "@/lib/auth/signed-fetch";

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
  purple: "#7c3aed",
  error: "#c62828",
  white: "#ffffff",
  fontPrimary: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  fontMono: '"Courier New", Courier, monospace',
};

/* ─── Templates ─── */
const TEMPLATES = [
  { key: "researcher", label: "Web Researcher", prompt: "You are a web research agent. Search the internet for current, accurate information on any topic. Compile findings into a clear, well-sourced report. Always cite your sources.", capId: "web.search", capDesc: "Web Search", price: "0.05" },
  { key: "translator", label: "Translator", prompt: "You are a professional translator. Translate the given text accurately while preserving tone and meaning. If no target language is specified, translate to English.", capId: "text.translate", capDesc: "Translate Text", price: "0.05" },
  { key: "summarizer", label: "Summarizer", prompt: "You are a summarization expert. Provide clear, concise summaries that capture the key points. Keep summaries to 2-3 paragraphs unless asked otherwise.", capId: "text.summarize", capDesc: "Summarize Text", price: "0.05" },
  { key: "defi-analyst", label: "DeFi Analyst", prompt: "You are a DeFi risk analyst. Analyze decentralized finance protocols, yield strategies, liquidity pools, and token economics. Assess risks, identify vulnerabilities, and provide data-driven recommendations.", capId: "defi.analyze", capDesc: "DeFi Risk Analysis", price: "0.15" },
  { key: "code-reviewer", label: "Code Reviewer", prompt: "You are a senior software engineer. Review the given code for bugs, performance issues, security vulnerabilities, and best practice violations. Provide actionable feedback.", capId: "code.review", capDesc: "Code Review", price: "0.15" },
  { key: "data-analyst", label: "Data Analyst", prompt: "You are a data analyst. Analyze the given data or question, provide insights, identify patterns, and present findings clearly with actionable recommendations.", capId: "data.analyze", capDesc: "Analyze Data", price: "0.10" },
  { key: "writer", label: "Content Writer", prompt: "You are a skilled content writer. Create engaging, well-structured content based on the given topic or brief. Adapt your tone to match the requested style.", capId: "text.write", capDesc: "Write Content", price: "0.10" },
  { key: "custom", label: "Custom Agent", prompt: "", capId: "", capDesc: "", price: "0.10" },
];

/* ─── Shared styles ─── */
const bandLabel: React.CSSProperties = { fontFamily: DS.fontMono, fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" };
const inputStyle: React.CSSProperties = { width: "100%", fontFamily: DS.fontMono, fontSize: "1rem", fontWeight: 700, padding: "14px 16px", border: `1px solid ${DS.border}`, backgroundColor: "transparent", outline: "none", color: DS.text };
const btnDark: React.CSSProperties = { padding: "14px 30px", fontFamily: DS.fontMono, fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", backgroundColor: DS.dark, color: DS.bg, border: "none", cursor: "pointer" };
const btnOutline: React.CSSProperties = { ...btnDark, backgroundColor: "transparent", border: `1px solid ${DS.border}`, color: DS.text };

/* ─── Step Indicator ─── */
function StepIndicator({ current }: { current: BuilderStep }) {
  const steps = [{ num: 1, label: "DEFINE" }, { num: 2, label: "BEHAVIOR" }, { num: 3, label: "PUBLISH" }];
  return (
    <div style={{ display: "flex", borderBottom: `1px solid ${DS.border}` }}>
      {steps.map((s) => (
        <div key={s.num} style={{
          flex: 1, padding: "14px 30px", fontFamily: DS.fontMono, fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em",
          borderRight: s.num < 3 ? `1px solid ${DS.border}` : "none",
          backgroundColor: s.num === current ? "#d5d0c8" : s.num < current ? DS.bg : DS.bg,
          color: s.num < current ? DS.green : s.num === current ? DS.text : DS.textMuted,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{
            width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.85rem", fontWeight: 700,
            backgroundColor: s.num < current ? DS.green : s.num === current ? DS.dark : "#bbb",
            color: DS.white,
          }} className="mp-white-text">
            {s.num < current ? "✓" : s.num}
          </span>
          {s.label}
        </div>
      ))}
    </div>
  );
}

/* ─── Main Page ─── */
export default function CreateAgentPage() {
  const router = useRouter();
  const { address } = useWalletStore();
  const store = useAgentBuilderStore();
  const { register: registerOnChain, loading: chainLoading } = useAgentRegistry();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  /* Theme override */
  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-create-theme", "true");
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
      main.pt-14 input::placeholder { color: #555555 !important; }
      main.pt-14 .mp-white-text { color: #ffffff !important; }
      main.pt-14 .ds-accent-text { color: ${DS.green} !important; }
      main.pt-14 .ds-error-text { color: ${DS.error} !important; }
      main.pt-14 .ds-muted-text { color: ${DS.textMuted} !important; }
      main.pt-14 select, main.pt-14 option { color: #000 !important; background-color: ${DS.bg} !important; }
      .tpl-btn { transition: background-color 0.15s ease; }
      .tpl-btn:hover { background-color: ${DS.bgHover} !important; }
      ::-webkit-scrollbar-track { background: ${DS.bg} !important; }
      ::-webkit-scrollbar-thumb { background: ${DS.textMuted} !important; }
      .create-hero-header::after {
        content: "AGENT BUILDER";
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

  // Reset builder on page enter and leave — always fresh start
  useEffect(() => {
    store.resetBuilder();
    return () => { store.resetBuilder(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted) return null;

  if (!address) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 16, fontFamily: DS.fontPrimary }}>
        <p style={{ ...bandLabel, color: DS.textMuted }}>CONNECT YOUR WALLET TO CREATE AN AGENT</p>
        <button onClick={() => router.push("/connect")} className="mp-white-text" style={btnDark}>Connect Wallet</button>
      </div>
    );
  }

  /* Success screen */
  if (store.published && store.txHash) {
    return (
      <div style={{ width: "100%", maxWidth: 1920, margin: "0 auto", fontFamily: DS.fontPrimary }}>
        <header style={{ padding: "40px 30px", borderBottom: `1px solid ${DS.border}` }}>
          <h2 style={{ fontSize: "4rem", fontWeight: 400, lineHeight: 0.95, textTransform: "uppercase", letterSpacing: "-0.02em", color: DS.text, fontFamily: DS.fontPrimary }}>
            Agent Published
          </h2>
        </header>
        <div style={{ padding: "60px 30px", maxWidth: 700 }}>
          <p style={{ fontFamily: DS.fontPrimary, fontSize: "1.1rem", lineHeight: 1.5, marginBottom: 20 }}>
            Your agent <strong>{store.name}</strong> is now live{store.isPublic ? " on the marketplace. People can start using it and you will earn USDC." : ". It's private — only you can use it via Twin."}
          </p>
          {store.txHash !== "hosted-only" && (
            <a href={`https://explorer.solana.com/tx/${store.txHash}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, color: DS.text, wordBreak: "break-all", display: "block", marginBottom: 24 }}>
              TX: {store.txHash}
            </a>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => router.push("/marketplace")} className="mp-white-text" style={btnDark}>VIEW MARKETPLACE</button>
            <button onClick={() => store.resetBuilder()} style={btnOutline}>CREATE ANOTHER</button>
          </div>
        </div>
      </div>
    );
  }

  const agentIdSlug = store.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);

  const step1Valid = store.name.trim().length > 0 && store.template !== "";
  const step2Valid = store.systemPrompt.trim().length > 10;
  const step3Valid = store.capabilities.length > 0 && store.capabilities.every((c) => c.id.trim() && c.description.trim() && parseFloat(c.amount) > 0);

  const selectTemplate = (key: string) => {
    store.setTemplate(key);
    const tpl = TEMPLATES.find((t) => t.key === key);
    if (tpl && key !== "custom") {
      store.setSystemPrompt(tpl.prompt);
      store.setCapabilities([{ id: tpl.capId, description: tpl.capDesc, amount: tpl.price }]);
    }
  };

  const handlePublish = async () => {
    if (!address || !step3Valid) return;
    store.setPublishing(true);
    // Track whether the backend register landed so we can roll it back
    // if the on-chain step later fails. Without this rollback the
    // agent stays live on the marketplace even when the user rejected
    // the Phantom prompt for the on-chain tx, which is misleading
    // (it looks like a real published agent but `onChain: false`).
    let backendRegistered = false;
    try {
      const res = await signedFetch("/api/hosted-agent/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agentIdSlug, ownerAddress: address, name: store.name.trim(), description: store.description.trim(),
          systemPrompt: store.systemPrompt.trim(), tier: store.tier, provider: store.provider,
          customApiKey: store.tier === "custom" ? store.customApiKey : undefined,
          capabilities: store.capabilities.map((c) => ({ id: c.id.trim(), description: c.description.trim(), pricing: { amount: c.amount, token: "USDC", network: "solana" } })),
          canOrchestrate: false,
          isPublic: store.isPublic,
          mcpServers: store.mcpServers.filter((s) => s.name.trim() && s.url.trim()).map((s) => ({ name: s.name.trim(), url: s.url.trim() })),
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to register hosted agent"); }
      backendRegistered = true;
      const data = await res.json();
      const sig = await registerOnChain({
        agentId: agentIdSlug, name: store.name.trim(), endpoint: data.endpoint, agentType: 1,
        walletAddress: address, version: "1.0.0",
        capabilities: store.capabilities.map((c) => ({ id: c.id.trim(), description: c.description.trim(), pricing: { amount: c.amount, token: "USDC", network: "solana" } })),
      });
      store.setPublished(sig || "hosted-only");
    } catch (err) {
      if (backendRegistered) {
        // Best-effort rollback - if this fails the agent is left in a
        // marketplace-only state that the user can clean up via the
        // dashboard delete flow. Either way we report the original
        // error to the user, not the rollback outcome.
        await signedFetch(
          `/api/hosted-agent/register?agentId=${encodeURIComponent(agentIdSlug)}&owner=${encodeURIComponent(address)}`,
          { method: "DELETE" },
        ).catch(() => {});
      }
      store.setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div style={{ width: "100%", maxWidth: 1920, margin: "0 auto", padding: "0 0 40px", fontFamily: DS.fontPrimary, WebkitFontSmoothing: "antialiased" }}>

      {/* ═══ Header ═══ */}
      <header className="create-hero-header" style={{ padding: "30px 40px 0", borderBottom: `1px solid ${DS.border}`, position: "relative", overflow: "hidden" }}>
        <h2 style={{ position: "relative", zIndex: 1, fontSize: "8rem", fontWeight: 300, lineHeight: 0.85, textTransform: "uppercase", letterSpacing: "-0.03em", color: DS.text, fontFamily: DS.fontPrimary, textShadow: "3px 3px 0px #d5d0c8", margin: 0, marginBottom: -6 }}>
          Create
        </h2>
      </header>

      {/* ═══ Step Indicator ═══ */}
      <StepIndicator current={store.step} />

      {/* ═══ STEP 1: DEFINE ═══ */}
      {store.step === 1 && (
        <div>
          {/* Name */}
          <div style={{ padding: "20px 30px", borderBottom: `1px solid ${DS.border}` }}>
            <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 8 }}>AGENT NAME</span>
            <input type="text" value={store.name} onChange={(e) => store.setName(e.target.value)} placeholder="My Translator Agent" maxLength={64} style={inputStyle} />
            {agentIdSlug && <span className="ds-muted-text" style={{ fontFamily: DS.fontMono, fontSize: "0.85rem", display: "block", marginTop: 6 }}>ID: {agentIdSlug}</span>}
          </div>

          {/* Description */}
          <div style={{ padding: "20px 30px", borderBottom: `1px solid ${DS.border}` }}>
            <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 8 }}>SHORT DESCRIPTION (OPTIONAL)</span>
            <input type="text" value={store.description} onChange={(e) => store.setDescription(e.target.value)} placeholder="Translates text between languages accurately" maxLength={200} style={inputStyle} />
          </div>

          {/* Templates */}
          <div style={{ padding: "20px 30px", borderBottom: `1px solid ${DS.border}` }}>
            <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 12 }}>CHOOSE A TEMPLATE</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, backgroundColor: DS.border }}>
              {TEMPLATES.map((tpl) => (
                <button key={tpl.key} onClick={() => selectTemplate(tpl.key)} className="tpl-btn" style={{
                  padding: "20px 16px", textAlign: "left", backgroundColor: store.template === tpl.key ? "#d5d0c8" : DS.bg,
                  border: "none", cursor: "pointer", borderLeft: store.template === tpl.key ? `4px solid ${DS.green}` : "4px solid transparent",
                }}>
                  <span style={{ fontFamily: DS.fontPrimary, fontSize: "1rem", fontWeight: 400, textTransform: "uppercase", display: "block", marginBottom: 4 }}>{tpl.label}</span>
                  {tpl.key !== "custom" && <span className="ds-muted-text" style={{ fontFamily: DS.fontMono, fontSize: "0.85rem" }}>{tpl.capDesc}</span>}
                  {tpl.key === "custom" && <span className="ds-muted-text" style={{ fontFamily: DS.fontMono, fontSize: "0.85rem" }}>BLANK CANVAS</span>}
                </button>
              ))}
              {TEMPLATES.length % 3 !== 0 && Array.from({ length: 3 - (TEMPLATES.length % 3) }).map((_, i) => (
                <div key={`fill-${i}`} style={{ backgroundColor: DS.bg }} />
              ))}
            </div>
          </div>

          {/* Next */}
          <div style={{ padding: "20px 30px", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12 }}>
            {!step1Valid && <span className="ds-error-text" style={{ fontFamily: DS.fontMono, fontSize: "0.85rem", fontWeight: 700 }}>{!store.name.trim() ? "AGENT NAME REQUIRED" : "SELECT A TEMPLATE"}</span>}
            <button onClick={() => store.setStep(2)} disabled={!step1Valid} className="mp-white-text" style={{ ...btnDark, opacity: step1Valid ? 1 : 0.4, cursor: step1Valid ? "pointer" : "not-allowed" }}>
              NEXT: BEHAVIOR
            </button>
          </div>
        </div>
      )}

      {/* ═══ STEP 2: BEHAVIOR ═══ */}
      {store.step === 2 && (
        <div>
          {/* System Prompt */}
          <div style={{ padding: "20px 30px", borderBottom: `1px solid ${DS.border}` }}>
            <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 4 }}>SYSTEM PROMPT</span>
            <span className="ds-muted-text" style={{ fontFamily: DS.fontMono, fontSize: "0.85rem", display: "block", marginBottom: 10 }}>
              Tell your agent who it is and what it should do
            </span>
            <textarea value={store.systemPrompt} onChange={(e) => store.setSystemPrompt(e.target.value)} placeholder="You are a helpful assistant that..." rows={8} maxLength={2000} style={{ ...inputStyle, resize: "vertical" }} />
            <span className="ds-muted-text" style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", display: "block", marginTop: 4, textAlign: "right" }}>{store.systemPrompt.length}/2000</span>
          </div>

          {/* Prompt Tips */}
          <div style={{ padding: "20px 30px", borderBottom: `1px solid ${DS.border}`, backgroundColor: "#dddcd7" }}>
            <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 10 }}>TIPS FOR A GOOD PROMPT</span>
            {[
              "Be specific about the role: \"You are a professional legal translator\"",
              "Define the output format: \"Always respond in JSON format\"",
              "Set boundaries: \"Only answer questions about cooking\"",
              "Add personality: \"Be concise and direct, no fluff\"",
            ].map((tip, i) => (
              <p key={i} style={{ fontFamily: DS.fontMono, fontSize: "0.85rem", fontWeight: 700, lineHeight: 1.6, paddingLeft: 12, position: "relative" }}>
                <span style={{ position: "absolute", left: 0 }}>-</span>{tip}
              </p>
            ))}
          </div>

          {/* Nav */}
          <div style={{ padding: "20px 30px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button onClick={() => store.setStep(1)} style={btnOutline}>BACK</button>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {!step2Valid && <span className="ds-error-text" style={{ fontFamily: DS.fontMono, fontSize: "0.85rem", fontWeight: 700 }}>MIN 10 CHARACTERS</span>}
              <button onClick={() => store.setStep(3)} disabled={!step2Valid} className="mp-white-text" style={{ ...btnDark, opacity: step2Valid ? 1 : 0.4, cursor: step2Valid ? "pointer" : "not-allowed" }}>
                NEXT: PUBLISH
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ STEP 3: PRICE & PUBLISH ═══ */}
      {store.step === 3 && (
        <div>
          {/* AI Engine */}
          <div style={{ padding: "20px 30px", borderBottom: `1px solid ${DS.border}` }}>
            <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 12 }}>AI ENGINE</span>
            <div style={{ display: "flex", gap: 0 }}>
              <button onClick={() => { store.setTier("platform"); store.setProvider("anthropic"); }} style={{
                flex: 1, padding: "16px 20px", textAlign: "left", fontFamily: DS.fontMono, fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase",
                backgroundColor: store.tier === "platform" ? "#c8c3ba" : "transparent",
                color: DS.text,
                border: `1px solid ${DS.border}`, borderRight: "none", cursor: "pointer",
                borderLeft: store.tier === "platform" ? `4px solid ${DS.green}` : `1px solid ${DS.border}`,
              }}>
                <span style={{ display: "block", marginBottom: 4 }}>PLATFORM AI</span>
                <span style={{ fontSize: "0.85rem", fontWeight: 400, color: DS.textMuted }}>CLAUDE HAIKU / NO KEY NEEDED</span>
              </button>
              <button onClick={() => store.setTier("custom")} style={{
                flex: 1, padding: "16px 20px", textAlign: "left", fontFamily: DS.fontMono, fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase",
                backgroundColor: store.tier === "custom" ? "#c8c3ba" : "transparent",
                color: DS.text,
                border: `1px solid ${DS.border}`, cursor: "pointer",
                borderLeft: store.tier === "custom" ? `4px solid ${DS.green}` : `1px solid ${DS.border}`,
              }}>
                <span style={{ display: "block", marginBottom: 4 }}>YOUR OWN KEY</span>
                <span style={{ fontSize: "0.85rem", fontWeight: 400, color: DS.textMuted }}>ANTHROPIC OR OPENAI / NO COMMISSION</span>
              </button>
            </div>
          </div>

          {/* Custom API Key */}
          {store.tier === "custom" && (
            <div style={{ padding: "20px 30px", borderBottom: `1px solid ${DS.border}` }}>
              <div style={{ display: "flex", gap: 0, marginBottom: 12 }}>
                {(["anthropic", "openai"] as const).map((p) => (
                  <button key={p} onClick={() => store.setProvider(p)} style={{
                    padding: "10px 24px", fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase",
                    backgroundColor: store.provider === p ? "#c8c3ba" : "transparent",
                    color: DS.text,
                    border: `1px solid ${DS.border}`, borderRight: p === "anthropic" ? "none" : `1px solid ${DS.border}`, cursor: "pointer",
                    borderBottom: store.provider === p ? `3px solid ${DS.green}` : `1px solid ${DS.border}`,
                  }}>
                    {p === "anthropic" ? "ANTHROPIC" : "OPENAI"}
                  </button>
                ))}
              </div>
              <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 8 }}>API KEY</span>
              <input type="text" value={store.customApiKey} onChange={(e) => store.setCustomApiKey(e.target.value)} placeholder={store.provider === "anthropic" ? "sk-ant-..." : "sk-..."} style={inputStyle} />
              <span className="ds-muted-text" style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", display: "block", marginTop: 6 }}>Your key is stored securely and only used when your agent is called.</span>
            </div>
          )}

          {/* Capabilities */}
          <div style={{ padding: "20px 30px", borderBottom: `1px solid ${DS.border}` }}>
            <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 12 }}>CAPABILITIES & PRICING</span>
            {store.capabilities.map((cap, idx) => (
              <div key={idx} style={{ border: `1px solid ${DS.border}`, marginBottom: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
                  <div style={{ padding: "12px 14px", borderRight: `1px solid ${DS.border}`, borderBottom: `1px solid ${DS.border}` }}>
                    <span style={{ ...bandLabel, fontSize: "0.8rem", color: DS.textMuted, display: "block", marginBottom: 6 }}>CAPABILITY ID</span>
                    <input type="text" value={cap.id} onChange={(e) => store.updateCapability(idx, "id", e.target.value)} placeholder="text.translate" style={{ ...inputStyle, padding: "6px 10px", fontSize: "0.85rem" }} />
                  </div>
                  <div style={{ padding: "12px 14px", borderBottom: `1px solid ${DS.border}` }}>
                    <span style={{ ...bandLabel, fontSize: "0.8rem", color: DS.textMuted, display: "block", marginBottom: 6 }}>DISPLAY NAME</span>
                    <input type="text" value={cap.description} onChange={(e) => store.updateCapability(idx, "description", e.target.value)} placeholder="Translate Text" style={{ ...inputStyle, padding: "6px 10px", fontSize: "0.85rem" }} />
                  </div>
                </div>
                <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ ...bandLabel, fontSize: "0.8rem", color: DS.textMuted }}>PRICE PER TASK:</span>
                    <input type="number" step="0.01" min="0.01" value={cap.amount} onChange={(e) => store.updateCapability(idx, "amount", e.target.value)} style={{ ...inputStyle, width: 80, padding: "6px 10px", fontSize: "0.85rem", textAlign: "center" }} />
                    <span style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700 }}>USDC</span>
                  </div>
                  {store.capabilities.length > 1 && (
                    <button onClick={() => store.removeCapability(idx)} className="ds-error-text" style={{ fontFamily: DS.fontMono, fontSize: "0.85rem", fontWeight: 700, background: "none", border: "none", cursor: "pointer", textTransform: "uppercase" }}>REMOVE</button>
                  )}
                </div>
              </div>
            ))}
            <button onClick={store.addCapability} className="ds-accent-text" style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, background: "none", border: "none", cursor: "pointer", textTransform: "uppercase", marginTop: 4 }}>+ ADD CAPABILITY</button>
          </div>

          {/* MCP Servers (Optional) */}
          <div style={{ padding: "20px 30px", borderBottom: `1px solid ${DS.border}`, backgroundColor: store.mcpServers.length > 0 ? "#e8e4da" : undefined }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ ...bandLabel, color: DS.text }}>MCP TOOLS</span>
                <span style={{ fontFamily: DS.fontMono, fontSize: "0.7rem", fontWeight: 600, color: "#b45309", backgroundColor: "#fef3c7", padding: "2px 8px", letterSpacing: "0.05em", textTransform: "uppercase" }}>OPTIONAL</span>
              </div>
              {store.mcpServers.length === 0 && (
                <button onClick={store.addMcpServer} style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, padding: "8px 16px", backgroundColor: "transparent", color: DS.text, border: `1px solid ${DS.border}`, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.05em" }}>+ CONNECT MCP SERVER</button>
              )}
            </div>
            {store.mcpServers.length === 0 ? (
              <div style={{ border: `1px dashed ${DS.textMuted}`, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                <span style={{ fontSize: "1.5rem" }}>&#9881;</span>
                <div>
                  <p style={{ fontFamily: DS.fontMono, fontSize: "0.85rem", fontWeight: 700, color: DS.text, margin: "0 0 4px 0" }}>Give your agent superpowers with MCP</p>
                  <p style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", color: DS.textMuted, margin: 0 }}>Connect external tools (databases, APIs, browsers, etc). Your agent will use them automatically when needed. MCP agents can do more — price accordingly.</p>
                </div>
              </div>
            ) : (
              <>
                {store.mcpServers.map((srv, idx) => (
                  <div key={idx} style={{ border: `1px solid ${DS.border}`, marginBottom: 8, backgroundColor: DS.bg }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 0 }}>
                      <div style={{ padding: "12px 14px", borderRight: `1px solid ${DS.border}`, borderBottom: `1px solid ${DS.border}` }}>
                        <span style={{ ...bandLabel, fontSize: "0.8rem", color: DS.textMuted, display: "block", marginBottom: 6 }}>SERVER NAME</span>
                        <input type="text" value={srv.name} onChange={(e) => store.updateMcpServer(idx, "name", e.target.value)} placeholder="my-tools" style={{ ...inputStyle, padding: "8px 10px", fontSize: "0.9rem" }} />
                      </div>
                      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${DS.border}` }}>
                        <span style={{ ...bandLabel, fontSize: "0.8rem", color: DS.textMuted, display: "block", marginBottom: 6 }}>ENDPOINT URL</span>
                        <input type="url" value={srv.url} onChange={(e) => store.updateMcpServer(idx, "url", e.target.value)} placeholder="https://my-mcp-server.com/mcp" style={{ ...inputStyle, padding: "8px 10px", fontSize: "0.9rem" }} />
                      </div>
                    </div>
                    <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontFamily: DS.fontMono, fontSize: "0.75rem", fontWeight: 600, color: "#b45309", backgroundColor: "#fef3c7", padding: "2px 8px" }}>STREAMABLE HTTP</span>
                      <button onClick={() => store.removeMcpServer(idx)} className="ds-error-text" style={{ fontFamily: DS.fontMono, fontSize: "0.85rem", fontWeight: 700, background: "none", border: "none", cursor: "pointer", textTransform: "uppercase" }}>REMOVE</button>
                    </div>
                  </div>
                ))}
                <button onClick={store.addMcpServer} style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, padding: "8px 16px", backgroundColor: DS.dark, color: DS.bg, border: "none", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 4 }}>+ ADD ANOTHER SERVER</button>
              </>
            )}
          </div>

          {/* Visibility */}
          <div style={{ padding: "20px 30px", borderBottom: `1px solid ${DS.border}` }}>
            <span style={{ ...bandLabel, color: DS.textMuted, display: "block", marginBottom: 12 }}>MARKETPLACE VISIBILITY</span>
            <div style={{ display: "flex", gap: 0 }}>
              <button onClick={() => store.setIsPublic(true)} style={{
                flex: 1, padding: "14px 20px", textAlign: "left", fontFamily: DS.fontMono, fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase",
                backgroundColor: store.isPublic ? "#c8c3ba" : "transparent", color: DS.text,
                border: `1px solid ${DS.border}`, borderRight: "none", cursor: "pointer",
                borderLeft: store.isPublic ? `4px solid ${DS.green}` : `1px solid ${DS.border}`,
              }}>
                <span style={{ display: "block", marginBottom: 4 }}>PUBLIC</span>
                <span style={{ fontSize: "0.8rem", fontWeight: 400, color: DS.textMuted }}>VISIBLE ON MARKETPLACE / ANYONE CAN USE</span>
              </button>
              <button onClick={() => store.setIsPublic(false)} style={{
                flex: 1, padding: "14px 20px", textAlign: "left", fontFamily: DS.fontMono, fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase",
                backgroundColor: !store.isPublic ? "#c8c3ba" : "transparent", color: DS.text,
                border: `1px solid ${DS.border}`, cursor: "pointer",
                borderLeft: !store.isPublic ? `4px solid ${DS.green}` : `1px solid ${DS.border}`,
              }}>
                <span style={{ display: "block", marginBottom: 4 }}>PRIVATE</span>
                <span style={{ fontSize: "0.8rem", fontWeight: 400, color: DS.textMuted }}>ONLY YOU CAN USE / NOT LISTED</span>
              </button>
            </div>
          </div>

          {/* Commission */}
          {store.tier === "platform" && (
            <div style={{ padding: "16px 30px", borderBottom: `1px solid ${DS.border}`, backgroundColor: "#dddcd7" }}>
              <span style={{ fontFamily: DS.fontMono, fontSize: "0.85rem", fontWeight: 700 }}>
                PLATFORM AI COMMISSION: 20% of each task payment covers AI costs. You earn 80%.
              </span>
              {store.capabilities[0]?.amount && (
                <span className="ds-muted-text" style={{ fontFamily: DS.fontMono, fontSize: "0.8rem", display: "block", marginTop: 4 }}>
                  Example: {store.capabilities[0].amount} USDC per task → you earn {(parseFloat(store.capabilities[0].amount) * 0.8).toFixed(2)} USDC
                </span>
              )}
            </div>
          )}

          {/* Error */}
          {store.error && (
            <div style={{ padding: "12px 30px", borderBottom: `1px solid ${DS.border}`, backgroundColor: "#f5e6e6" }}>
              <span className="ds-error-text" style={{ fontFamily: DS.fontMono, fontSize: "0.85rem", fontWeight: 700 }}>{store.error}</span>
            </div>
          )}

          {/* Nav */}
          <div style={{ padding: "20px 30px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button onClick={() => store.setStep(2)} style={btnOutline}>BACK</button>
            <button onClick={handlePublish} disabled={!step3Valid || store.publishing || chainLoading} className="mp-white-text" style={{ ...btnDark, opacity: !step3Valid || store.publishing || chainLoading ? 0.4 : 1, cursor: !step3Valid || store.publishing || chainLoading ? "not-allowed" : "pointer" }}>
              {store.publishing || chainLoading ? "PUBLISHING..." : "PUBLISH AGENT"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
