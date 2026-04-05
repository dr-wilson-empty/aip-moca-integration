"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import { useAgentRegistry, type AgentParams } from "@/hooks/useRegisterAgent";
import { useAgentStore } from "@/store/agentStore";
import type { MyAgentEntry } from "@/types/aip";
import MonoLabel from "@/components/ui/MonoLabel";
import BtnPrimary from "@/components/ui/BtnPrimary";
import AgentAnalytics from "./AgentAnalytics";
import AgentBudget from "./AgentBudget";

interface CapabilityRow {
  id: string;
  description: string;
  amount: string;
}

type View = "list" | "register" | "edit";

export default function RegisterAgentForm({ onRegistered }: { onRegistered?: () => void }) {
  const { publicKey } = useWallet();
  const router = useRouter();
  const { register, update, deregister, loading, error } = useAgentRegistry();
  const { myAgents, myAgentsLoading, syncFromChain } = useAgentStore();

  const [view, setView] = useState<View>("list");
  const [editAgent, setEditAgent] = useState<MyAgentEntry | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txAction, setTxAction] = useState("");

  // Form state
  const [agentId, setAgentId] = useState("");
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [agentType, setAgentType] = useState(1);
  const [version, setVersion] = useState("1.0.0");
  const [capabilities, setCapabilities] = useState<CapabilityRow[]>([
    { id: "", description: "", amount: "0.10" },
  ]);

  // Sync agents on wallet connection
  useEffect(() => {
    if (publicKey) syncFromChain(publicKey.toBase58());
  }, [publicKey, syncFromChain]);

  const handleRefresh = useCallback(() => {
    if (publicKey) syncFromChain(publicKey.toBase58());
  }, [publicKey, syncFromChain]);

  const resetForm = () => {
    setAgentId(""); setName(""); setEndpoint("");
    setAgentType(1); setVersion("1.0.0");
    setCapabilities([{ id: "", description: "", amount: "0.10" }]);
    setEditAgent(null);
  };

  const startEdit = (agent: MyAgentEntry) => {
    setEditAgent(agent);
    setAgentId(agent.agentId);
    setName(agent.name);
    setEndpoint(agent.endpoint);
    setAgentType(agent.type === "LLM" ? 0 : agent.type === "Execution" ? 2 : 1);
    setVersion(agent.version);
    const caps = agent.capabilities.map((c) => ({
      id: c.id, description: c.description, amount: c.pricing?.amount || "0.10",
    }));
    setCapabilities(caps.length ? caps : [{ id: "", description: "", amount: "0.10" }]);
    setView("edit");
  };

  const startRegister = () => {
    resetForm();
    setView("register");
  };

  const addCapability = () => setCapabilities([...capabilities, { id: "", description: "", amount: "0.10" }]);
  const removeCapability = (idx: number) => setCapabilities(capabilities.filter((_, i) => i !== idx));
  const updateCapability = (idx: number, field: keyof CapabilityRow, value: string) => {
    const u = [...capabilities]; u[idx] = { ...u[idx], [field]: value }; setCapabilities(u);
  };

  const isValid =
    (view === "register" ? agentId.trim().length > 0 : true) &&
    name.trim() && endpoint.trim() && publicKey &&
    capabilities.length > 0 &&
    capabilities.every((c) => c.id.trim() && c.description.trim() && parseFloat(c.amount) > 0);

  const buildParams = (): AgentParams => ({
    agentId: (editAgent?.agentId || agentId).trim().toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    name: name.trim(),
    endpoint: endpoint.trim(),
    agentType,
    walletAddress: publicKey!.toBase58(),
    version: version.trim() || "1.0.0",
    capabilities: capabilities.map((c) => ({
      id: c.id.trim(), description: c.description.trim(),
      pricing: { amount: c.amount, token: "USDC", network: "solana" },
    })),
  });

  /** Track UI registration in Supabase so we can distinguish UI vs external */
  const trackUIRegistration = async (did: string, owner: string, agId: string) => {
    try {
      await fetch("/api/agent-card/my-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ did, owner, agentId: agId }),
      });
    } catch { /* non-blocking */ }
  };

  const handleRegister = async () => {
    if (!isValid || !publicKey) return;
    const params = buildParams();
    const sig = await register(params);
    if (sig) {
      // Track this as a UI registration
      const ownerAddr = publicKey.toBase58();
      const did = `did:aip:${ownerAddr.slice(0, 8)}:${params.agentId}`;
      await trackUIRegistration(did, ownerAddr, params.agentId);
      setTxHash(sig);
      setTxAction("registered");
      syncFromChain(ownerAddr);
      onRegistered?.();
    }
  };

  const handleUpdate = async () => {
    if (!isValid || !editAgent || !publicKey) return;
    const sig = await update(buildParams());
    if (sig) {
      setTxHash(sig);
      setTxAction("updated");
      syncFromChain(publicKey.toBase58());
      onRegistered?.();
    }
  };

  const handleDeregister = async (id: string) => {
    if (!publicKey) return;
    const sig = await deregister(id);
    if (sig) {
      setTxHash(sig);
      setTxAction("deregistered");
      syncFromChain(publicKey.toBase58());
      onRegistered?.();
    }
  };

  const handleDeleteHosted = async (id: string) => {
    if (!publicKey) return;
    try {
      const res = await fetch(`/api/hosted-agent/register?agentId=${id}&owner=${publicKey.toBase58()}`, {
        method: "DELETE",
      });
      if (res.ok) syncFromChain(publicKey.toBase58());
    } catch { /* ignore */ }
  };

  if (!publicKey) {
    return (
      <div className="border border-mint/20 rounded-lg p-6">
        <p className="font-mono text-sm text-muted">Connect your wallet to manage agents.</p>
      </div>
    );
  }

  // Success screen
  if (txHash) {
    return (
      <div className="border border-accent/30 rounded-lg p-6 bg-accent/5">
        <p className="font-mono text-sm text-accent mb-2">Agent {txAction}!</p>
        <a
          href={`https://explorer.solana.com/tx/${txHash}?cluster=devnet`}
          target="_blank" rel="noopener noreferrer"
          className="font-mono text-xs text-mint underline break-all"
        >{txHash}</a>
        <button
          onClick={() => { setTxHash(null); setTxAction(""); setView("list"); }}
          className="font-mono text-xs text-muted mt-3 block hover:text-mint"
        >Back to my agents</button>
      </div>
    );
  }

  // ---- LIST VIEW ----
  if (view === "list") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs text-mint uppercase">My Agents</span>
          <div className="flex gap-2">
            <button
              onClick={handleRefresh}
              disabled={myAgentsLoading}
              className="font-mono text-[11px] px-2.5 py-1.5 border border-mint/20 rounded text-muted hover:text-mint hover:border-mint/40 transition-colors disabled:opacity-50"
            >
              {myAgentsLoading ? "Syncing..." : "Refresh from Chain"}
            </button>
            <BtnPrimary onClick={() => router.push("/create-agent")} className="text-[11px] px-3 py-1.5">
              + No-Code
            </BtnPrimary>
            <BtnPrimary variant="secondary" onClick={startRegister} className="text-[11px] px-3 py-1.5">
              + SDK
            </BtnPrimary>
          </div>
        </div>

        {myAgentsLoading ? (
          <p className="font-mono text-xs text-muted">Loading agents from chain...</p>
        ) : myAgents.length === 0 ? (
          <div className="border border-forest-deep/40 rounded-lg p-6 text-center">
            <p className="font-mono text-sm text-muted mb-3">You have no agents yet.</p>
            <div className="flex gap-3 justify-center">
              <BtnPrimary onClick={() => router.push("/create-agent")}>Create with No-Code</BtnPrimary>
              <BtnPrimary variant="secondary" onClick={startRegister}>Register with SDK</BtnPrimary>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {myAgents.map((agent) => (
              <div key={agent.agentId} className="border border-mint/20 rounded-lg p-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-display text-sm text-mint uppercase tracking-wider">{agent.name}</span>
                    <SourceBadge source={agent.registrationSource} />
                  </div>
                  <p className="font-mono text-sm text-muted truncate">{agent.endpoint}</p>
                  <p className="font-mono text-sm text-muted/50">id: {agent.agentId}</p>

                  {/* PDA address with Solana Explorer deeplink */}
                  {agent.onChainPDA && (
                    <a
                      href={`https://explorer.solana.com/address/${agent.onChainPDA}?cluster=devnet`}
                      target="_blank" rel="noopener noreferrer"
                      className="font-mono text-sm text-accent/60 hover:text-accent transition-colors inline-flex items-center gap-1"
                    >
                      PDA: {agent.onChainPDA.slice(0, 8)}...{agent.onChainPDA.slice(-6)}
                      <span className="text-[10px]">&#8599;</span>
                    </a>
                  )}

                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {agent.capabilities.map((c) => (
                      <span key={c.id} className="font-mono text-sm text-muted">
                        {c.description} <span className="text-accent">{c.pricing?.amount || "?"} USDC</span>
                      </span>
                    ))}
                  </div>
                  <AgentAnalytics did={agent.did} />
                  <AgentBudget agentDid={agent.did} />
                </div>
                <div className="flex flex-col gap-1.5">
                  {agent.registrationSource !== "hosted" && agent.registrationSource !== "external" && (
                    <button
                      onClick={() => startEdit(agent)}
                      className="font-mono text-sm text-mint hover:text-accent px-2 py-1 border border-mint/20 rounded"
                    >Edit</button>
                  )}
                  {agent.registrationSource === "external" && (
                    <button
                      onClick={() => startEdit(agent)}
                      className="font-mono text-sm text-mint hover:text-accent px-2 py-1 border border-mint/20 rounded"
                    >Claim</button>
                  )}
                  <button
                    onClick={() => agent.registrationSource === "hosted"
                      ? handleDeleteHosted(agent.agentId)
                      : handleDeregister(agent.agentId)}
                    disabled={loading}
                    className="font-mono text-sm text-red-400 hover:text-red-300 px-2 py-1 border border-red-800/30 rounded"
                  >{loading ? "..." : "Delete"}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---- REGISTER / EDIT FORM ----
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-mint uppercase">
          {view === "edit" ? `Edit: ${editAgent?.name}` : "Register New Agent"}
        </span>
        <button onClick={() => { resetForm(); setView("list"); }} className="font-mono text-xs text-muted hover:text-mint">
          Back
        </button>
      </div>

      {/* Agent ID (only on register) */}
      {view === "register" && (
        <div>
          <MonoLabel className="mb-1">Agent ID (slug, cannot be changed later)</MonoLabel>
          <input
            type="text"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
            placeholder="my-summary-bot"
            maxLength={32}
            className="w-full bg-bg-base border border-mint/20 rounded px-3 py-2 font-mono text-sm text-mint placeholder:text-muted/40 focus:border-mint/40 focus:outline-none"
          />
          <p className="font-mono text-sm text-muted/50 mt-1">Only lowercase letters, numbers, hyphens. Max 32 chars.</p>
        </div>
      )}

      <div>
        <MonoLabel className="mb-1">Agent Name</MonoLabel>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Agent" maxLength={64}
          className="w-full bg-bg-base border border-mint/20 rounded px-3 py-2 font-mono text-sm text-mint placeholder:text-muted/40 focus:border-mint/40 focus:outline-none" />
      </div>

      <div>
        <MonoLabel className="mb-1">Endpoint URL</MonoLabel>
        <input type="text" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="http://localhost:4004/a2a" maxLength={200}
          className="w-full bg-bg-base border border-mint/20 rounded px-3 py-2 font-mono text-sm text-mint placeholder:text-muted/40 focus:border-mint/40 focus:outline-none" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <MonoLabel className="mb-1">Type</MonoLabel>
          <select value={agentType} onChange={(e) => setAgentType(Number(e.target.value))}
            className="w-full bg-bg-base border border-mint/20 rounded px-3 py-2 font-mono text-sm text-mint focus:border-mint/40 focus:outline-none">
            <option value={0}>LLM</option>
            <option value={1}>Task</option>
            <option value={2}>Execution</option>
          </select>
        </div>
        <div>
          <MonoLabel className="mb-1">Version</MonoLabel>
          <input type="text" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0.0" maxLength={16}
            className="w-full bg-bg-base border border-mint/20 rounded px-3 py-2 font-mono text-sm text-mint placeholder:text-muted/40 focus:border-mint/40 focus:outline-none" />
        </div>
      </div>

      <div>
        <MonoLabel className="mb-2">Capabilities</MonoLabel>
        <div className="flex flex-col gap-3">
          {capabilities.map((cap, idx) => (
            <div key={idx} className="border border-forest-deep/40 rounded p-3 flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="font-mono text-sm text-muted/60 uppercase block mb-1">Capability ID</span>
                  <input type="text" value={cap.id} onChange={(e) => updateCapability(idx, "id", e.target.value)}
                    placeholder="text.summarize"
                    className="w-full bg-bg-base border border-mint/10 rounded px-2 py-1.5 font-mono text-xs text-mint placeholder:text-muted/40 focus:border-mint/30 focus:outline-none" />
                </div>
                <div>
                  <span className="font-mono text-sm text-muted/60 uppercase block mb-1">Display Name</span>
                  <input type="text" value={cap.description} onChange={(e) => updateCapability(idx, "description", e.target.value)}
                    placeholder="Summarize Text"
                    className="w-full bg-bg-base border border-mint/10 rounded px-2 py-1.5 font-mono text-xs text-mint placeholder:text-muted/40 focus:border-mint/30 focus:outline-none" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div>
                  <span className="font-mono text-sm text-muted/60 uppercase block mb-1">Price</span>
                  <div className="flex items-center gap-2">
                    <input type="number" step="0.01" min="0.01" value={cap.amount}
                      onChange={(e) => updateCapability(idx, "amount", e.target.value)}
                      className="w-24 bg-bg-base border border-mint/10 rounded px-2 py-1.5 font-mono text-xs text-accent focus:border-mint/30 focus:outline-none" />
                    <span className="font-mono text-xs text-muted">USDC</span>
                  </div>
                </div>
                {capabilities.length > 1 && (
                  <button onClick={() => removeCapability(idx)} className="ml-auto mt-4 font-mono text-xs text-red-400 hover:text-red-300">Remove</button>
                )}
              </div>
            </div>
          ))}
        </div>
        <button onClick={addCapability} className="mt-2 font-mono text-xs text-mint hover:text-accent transition-colors">+ Add Capability</button>
      </div>

      {error && (
        <p className="font-mono text-xs text-red-400 bg-red-900/10 border border-red-800/30 rounded p-2">{error}</p>
      )}

      <BtnPrimary onClick={view === "edit" ? handleUpdate : handleRegister} disabled={!isValid || loading}>
        {loading ? "Signing..." : view === "edit" ? "Update On-Chain" : "Register On-Chain"}
      </BtnPrimary>
    </div>
  );
}

/** Badge component for registration source */
function SourceBadge({ source }: { source: string }) {
  switch (source) {
    case "hosted":
      return (
        <span className="font-mono text-sm text-cyan-400 uppercase px-1.5 py-0.5 border rounded border-cyan-800/40 bg-cyan-900/10">
          hosted
        </span>
      );
    case "external":
      return (
        <span className="font-mono text-sm text-amber-400 uppercase px-1.5 py-0.5 border rounded border-amber-800/40 bg-amber-900/10">
          external
        </span>
      );
    case "ui":
      return (
        <span className="font-mono text-sm text-purple-400 uppercase px-1.5 py-0.5 border rounded border-purple-800/40 bg-purple-900/10">
          on-chain
        </span>
      );
    default:
      return (
        <span className="font-mono text-sm text-muted uppercase px-1.5 py-0.5 border rounded border-muted/20">
          {source}
        </span>
      );
  }
}
