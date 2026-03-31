"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useRegisterAgent, type RegisterAgentParams } from "@/hooks/useRegisterAgent";
import MonoLabel from "@/components/ui/MonoLabel";
import BtnPrimary from "@/components/ui/BtnPrimary";

interface CapabilityRow {
  id: string;
  description: string;
  amount: string;
}

export default function RegisterAgentForm({ onRegistered }: { onRegistered?: () => void }) {
  const { publicKey } = useWallet();
  const { register, loading, error } = useRegisterAgent();

  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [agentType, setAgentType] = useState(1); // Task
  const [version, setVersion] = useState("1.0.0");
  const [capabilities, setCapabilities] = useState<CapabilityRow[]>([
    { id: "", description: "", amount: "0.10" },
  ]);
  const [txHash, setTxHash] = useState<string | null>(null);

  const addCapability = () => {
    setCapabilities([...capabilities, { id: "", description: "", amount: "0.10" }]);
  };

  const removeCapability = (idx: number) => {
    setCapabilities(capabilities.filter((_, i) => i !== idx));
  };

  const updateCapability = (idx: number, field: keyof CapabilityRow, value: string) => {
    const updated = [...capabilities];
    updated[idx] = { ...updated[idx], [field]: value };
    setCapabilities(updated);
  };

  const isValid =
    name.trim() &&
    endpoint.trim() &&
    publicKey &&
    capabilities.length > 0 &&
    capabilities.every((c) => c.id.trim() && c.description.trim() && parseFloat(c.amount) > 0);

  const handleSubmit = async () => {
    if (!publicKey || !isValid) return;

    const params: RegisterAgentParams = {
      name: name.trim(),
      endpoint: endpoint.trim(),
      agentType,
      walletAddress: publicKey.toBase58(),
      version: version.trim() || "1.0.0",
      capabilities: capabilities.map((c) => ({
        id: c.id.trim(),
        description: c.description.trim(),
        pricing: { amount: c.amount, token: "USDC", network: "solana" },
      })),
    };

    const sig = await register(params);
    if (sig) {
      setTxHash(sig);
      onRegistered?.();
    }
  };

  if (!publicKey) {
    return (
      <div className="border border-mint/20 rounded-lg p-6">
        <p className="font-mono text-sm text-muted">
          Connect your wallet to register an agent on-chain.
        </p>
      </div>
    );
  }

  if (txHash) {
    return (
      <div className="border border-accent/30 rounded-lg p-6 bg-accent/5">
        <p className="font-mono text-sm text-accent mb-2">Agent registered on-chain!</p>
        <a
          href={`https://explorer.solana.com/tx/${txHash}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs text-mint underline break-all"
        >
          {txHash}
        </a>
        <button
          onClick={() => { setTxHash(null); setName(""); setEndpoint(""); setCapabilities([{ id: "", description: "", amount: "0.10" }]); }}
          className="font-mono text-xs text-muted mt-3 block hover:text-mint"
        >
          Register another
        </button>
      </div>
    );
  }

  return (
    <div className="border border-mint/20 rounded-lg p-6 flex flex-col gap-4">
      <span className="font-mono text-xs text-mint uppercase">Register Agent On-Chain</span>

      {/* Name */}
      <div>
        <MonoLabel className="mb-1">Agent Name</MonoLabel>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Agent"
          maxLength={64}
          className="w-full bg-bg-base border border-mint/20 rounded px-3 py-2 font-mono text-sm text-mint placeholder:text-muted/40 focus:border-mint/40 focus:outline-none"
        />
      </div>

      {/* Endpoint */}
      <div>
        <MonoLabel className="mb-1">Endpoint URL</MonoLabel>
        <input
          type="text"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="https://my-agent.example.com/a2a"
          maxLength={200}
          className="w-full bg-bg-base border border-mint/20 rounded px-3 py-2 font-mono text-sm text-mint placeholder:text-muted/40 focus:border-mint/40 focus:outline-none"
        />
      </div>

      {/* Type + Version */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <MonoLabel className="mb-1">Type</MonoLabel>
          <select
            value={agentType}
            onChange={(e) => setAgentType(Number(e.target.value))}
            className="w-full bg-bg-base border border-mint/20 rounded px-3 py-2 font-mono text-sm text-mint focus:border-mint/40 focus:outline-none"
          >
            <option value={0}>LLM</option>
            <option value={1}>Task</option>
            <option value={2}>Execution</option>
          </select>
        </div>
        <div>
          <MonoLabel className="mb-1">Version</MonoLabel>
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="1.0.0"
            maxLength={16}
            className="w-full bg-bg-base border border-mint/20 rounded px-3 py-2 font-mono text-sm text-mint placeholder:text-muted/40 focus:border-mint/40 focus:outline-none"
          />
        </div>
      </div>

      {/* Wallet (auto) */}
      <div>
        <MonoLabel className="mb-1">Payment Wallet</MonoLabel>
        <p className="font-mono text-xs text-muted break-all">{publicKey.toBase58()}</p>
      </div>

      {/* Capabilities */}
      <div>
        <MonoLabel className="mb-2">Capabilities</MonoLabel>
        <div className="flex flex-col gap-3">
          {capabilities.map((cap, idx) => (
            <div key={idx} className="border border-forest-deep/40 rounded p-3 flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={cap.id}
                  onChange={(e) => updateCapability(idx, "id", e.target.value)}
                  placeholder="text.summarize"
                  className="bg-bg-base border border-mint/10 rounded px-2 py-1.5 font-mono text-xs text-mint placeholder:text-muted/40 focus:border-mint/30 focus:outline-none"
                />
                <input
                  type="text"
                  value={cap.description}
                  onChange={(e) => updateCapability(idx, "description", e.target.value)}
                  placeholder="Summarize Text"
                  className="bg-bg-base border border-mint/10 rounded px-2 py-1.5 font-mono text-xs text-mint placeholder:text-muted/40 focus:border-mint/30 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={cap.amount}
                  onChange={(e) => updateCapability(idx, "amount", e.target.value)}
                  className="w-24 bg-bg-base border border-mint/10 rounded px-2 py-1.5 font-mono text-xs text-accent focus:border-mint/30 focus:outline-none"
                />
                <span className="font-mono text-xs text-muted">USDC</span>
                {capabilities.length > 1 && (
                  <button
                    onClick={() => removeCapability(idx)}
                    className="ml-auto font-mono text-xs text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={addCapability}
          className="mt-2 font-mono text-xs text-mint hover:text-accent transition-colors"
        >
          + Add Capability
        </button>
      </div>

      {error && (
        <p className="font-mono text-xs text-red-400 bg-red-900/10 border border-red-800/30 rounded p-2">
          {error}
        </p>
      )}

      <BtnPrimary onClick={handleSubmit} disabled={!isValid || loading}>
        {loading ? "Signing..." : "Register On-Chain"}
      </BtnPrimary>
    </div>
  );
}
