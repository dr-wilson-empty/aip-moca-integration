"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAgentRegistry, type AgentParams } from "@/hooks/useRegisterAgent";
import MonoLabel from "@/components/ui/MonoLabel";
import BtnPrimary from "@/components/ui/BtnPrimary";

interface CapabilityRow {
  id: string;
  description: string;
  amount: string;
}

interface MyAgent {
  agentId: string;
  did: string;
  name: string;
  endpoint: string;
  agentType: number;
  version: string;
  capabilities: CapabilityRow[];
}

type View = "list" | "register" | "edit";

export default function RegisterAgentForm({ onRegistered }: { onRegistered?: () => void }) {
  const { publicKey } = useWallet();
  const { register, update, deregister, loading, error } = useAgentRegistry();

  const [view, setView] = useState<View>("list");
  const [myAgents, setMyAgents] = useState<MyAgent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [editAgent, setEditAgent] = useState<MyAgent | null>(null);
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

  // Fetch user's agents
  const loadMyAgents = useCallback(() => {
    if (!publicKey) return;
    setLoadingAgents(true);
    fetch(`/api/agent-card/my-agents?owner=${publicKey.toBase58()}`)
      .then((r) => r.json())
      .then((data) => {
        const agents = (data.agents ?? []).map((a: Record<string, unknown>) => ({
          agentId: a.agentId as string,
          did: a.did as string,
          name: a.name as string,
          endpoint: a.endpoint as string,
          agentType: a.agentType as number,
          version: a.version as string,
          capabilities: parseCapabilities(a.capabilitiesJson as string),
        }));
        setMyAgents(agents);
      })
      .catch(() => setMyAgents([]))
      .finally(() => setLoadingAgents(false));
  }, [publicKey]);

  useEffect(() => { loadMyAgents(); }, [loadMyAgents]);

  function parseCapabilities(json: string): CapabilityRow[] {
    try {
      const caps = JSON.parse(json);
      return caps.map((c: { id: string; description: string; pricing: { amount: string } }) => ({
        id: c.id,
        description: c.description,
        amount: c.pricing?.amount || "0.10",
      }));
    } catch { return []; }
  }

  const resetForm = () => {
    setAgentId(""); setName(""); setEndpoint("");
    setAgentType(1); setVersion("1.0.0");
    setCapabilities([{ id: "", description: "", amount: "0.10" }]);
    setEditAgent(null);
  };

  const startEdit = (agent: MyAgent) => {
    setEditAgent(agent);
    setAgentId(agent.agentId);
    setName(agent.name);
    setEndpoint(agent.endpoint);
    setAgentType(agent.agentType);
    setVersion(agent.version);
    setCapabilities(agent.capabilities.length ? agent.capabilities : [{ id: "", description: "", amount: "0.10" }]);
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

  const handleRegister = async () => {
    if (!isValid) return;
    const sig = await register(buildParams());
    if (sig) { setTxHash(sig); setTxAction("registered"); loadMyAgents(); onRegistered?.(); }
  };

  const handleUpdate = async () => {
    if (!isValid || !editAgent) return;
    const sig = await update(buildParams());
    if (sig) { setTxHash(sig); setTxAction("updated"); loadMyAgents(); onRegistered?.(); }
  };

  const handleDeregister = async (id: string) => {
    const sig = await deregister(id);
    if (sig) { setTxHash(sig); setTxAction("deregistered"); loadMyAgents(); onRegistered?.(); }
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
          <BtnPrimary variant="secondary" onClick={startRegister} className="text-[11px] px-3 py-1.5">
            + New Agent
          </BtnPrimary>
        </div>

        {loadingAgents ? (
          <p className="font-mono text-xs text-muted">Loading...</p>
        ) : myAgents.length === 0 ? (
          <div className="border border-forest-deep/40 rounded-lg p-6 text-center">
            <p className="font-mono text-sm text-muted mb-3">You have no agents registered on-chain.</p>
            <BtnPrimary onClick={startRegister}>Register Your First Agent</BtnPrimary>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {myAgents.map((agent) => (
              <div key={agent.agentId} className="border border-mint/20 rounded-lg p-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-display text-sm text-mint uppercase tracking-wider">{agent.name}</span>
                    <span className="font-mono text-[10px] text-purple-400 uppercase px-1.5 py-0.5 border rounded border-purple-800/40 bg-purple-900/10">
                      on-chain
                    </span>
                  </div>
                  <p className="font-mono text-[10px] text-muted truncate">{agent.endpoint}</p>
                  <p className="font-mono text-[10px] text-muted/50">id: {agent.agentId}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {agent.capabilities.map((c) => (
                      <span key={c.id} className="font-mono text-[10px] text-muted">
                        {c.description} <span className="text-accent">{c.amount} USDC</span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => startEdit(agent)}
                    className="font-mono text-[10px] text-mint hover:text-accent px-2 py-1 border border-mint/20 rounded"
                  >Edit</button>
                  <button
                    onClick={() => handleDeregister(agent.agentId)}
                    disabled={loading}
                    className="font-mono text-[10px] text-red-400 hover:text-red-300 px-2 py-1 border border-red-800/30 rounded"
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
          <p className="font-mono text-[10px] text-muted/50 mt-1">Only lowercase letters, numbers, hyphens. Max 32 chars.</p>
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
                  <span className="font-mono text-[10px] text-muted/60 uppercase block mb-1">Capability ID</span>
                  <input type="text" value={cap.id} onChange={(e) => updateCapability(idx, "id", e.target.value)}
                    placeholder="text.summarize"
                    className="w-full bg-bg-base border border-mint/10 rounded px-2 py-1.5 font-mono text-xs text-mint placeholder:text-muted/40 focus:border-mint/30 focus:outline-none" />
                </div>
                <div>
                  <span className="font-mono text-[10px] text-muted/60 uppercase block mb-1">Display Name</span>
                  <input type="text" value={cap.description} onChange={(e) => updateCapability(idx, "description", e.target.value)}
                    placeholder="Summarize Text"
                    className="w-full bg-bg-base border border-mint/10 rounded px-2 py-1.5 font-mono text-xs text-mint placeholder:text-muted/40 focus:border-mint/30 focus:outline-none" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div>
                  <span className="font-mono text-[10px] text-muted/60 uppercase block mb-1">Price</span>
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
