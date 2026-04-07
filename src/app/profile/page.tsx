"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletStore } from "@/store/walletStore";
import { useLogStore } from "@/store/logStore";
import { signedFetch } from "@/lib/auth/signed-fetch";
import MonoLabel from "@/components/ui/MonoLabel";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="font-mono text-[10px] text-muted hover:text-mint transition-colors"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function StatCard({ label, value, color = "text-mint" }: { label: string; value: string; color?: string }) {
  return (
    <div className="border border-forest-deep/60 bg-forest-deep/20 p-4 rounded-lg">
      <span className="font-mono text-[9px] text-muted uppercase block mb-1">{label}</span>
      <span className={`font-display text-xl uppercase ${color}`}>{value}</span>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { disconnect } = useWallet();
  const { address, did, usdcBalance } = useWalletStore();
  const { tasks } = useLogStore();

  const handleDisconnect = () => {
    disconnect();
    router.push("/connect");
  };
  const [solBalance, setSolBalance] = useState<string>("...");
  const [myAgentCount, setMyAgentCount] = useState(0);
  const [prefLang, setPrefLang] = useState("auto");
  const [prefDetail, setPrefDetail] = useState("medium");
  const [prefInstructions, setPrefInstructions] = useState("");
  const [prefsSaving, setPrefsSaving] = useState(false);

  useEffect(() => {
    if (!address) return;
    // Fetch SOL balance
    fetch(`/api/wallet/balance?address=${address}&type=sol`)
      .then((r) => r.json())
      .then((d) => setSolBalance(d.solBalance ?? "..."))
      .catch(() => setSolBalance("..."));
    // Fetch my agents count
    fetch(`/api/agent-card/my-agents?owner=${address}`)
      .then((r) => r.json())
      .then((d) => setMyAgentCount(d.agents?.length ?? 0))
      .catch(() => {});
    // Fetch preferences
    signedFetch(`/api/preferences?wallet=${address}`)
      .then((r) => r.json())
      .then((d) => {
        setPrefLang(d.language || "auto");
        setPrefDetail(d.detail_level || "medium");
        setPrefInstructions(d.custom_instructions || "");
      })
      .catch(() => {});
  }, [address]);

  const savePrefs = async () => {
    if (!address) return;
    setPrefsSaving(true);
    await signedFetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet_address: address,
        language: prefLang,
        detail_level: prefDetail,
        custom_instructions: prefInstructions,
      }),
    });
    setPrefsSaving(false);
  };

  if (!address) {
    return (
      <div className="max-w-[1920px] mx-auto px-10 py-12 flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <span className="font-mono text-sm text-muted">Connect your wallet to view profile.</span>
        <button onClick={() => router.push("/connect")} className="font-mono text-xs text-accent hover:text-mint">
          Go to Connect
        </button>
      </div>
    );
  }

  const totalTasks = tasks.length;
  const completed = tasks.filter((t) => t.state === "COMPLETED").length;
  const totalSpent = tasks.reduce((sum, t) => sum + parseFloat(t.usdcSpent || "0"), 0);

  return (
    <div className="max-w-[1920px] mx-auto px-10 py-12">
      {/* Header */}
      <div className="mb-10">
        <span className="font-mono text-xs text-muted uppercase tracking-wider">Your Account</span>
        <h2 className="font-display text-3xl text-mint uppercase tracking-tight mt-1">Profile</h2>
      </div>

      {/* Balance Hero */}
      <div className="border border-mint/20 rounded-2xl p-10 mb-8 bg-gradient-to-br from-forest-deep/30 to-transparent">
        <div className="grid grid-cols-2 gap-10">
          <div>
            <span className="font-mono text-xs text-muted uppercase block mb-2">USDC Balance</span>
            <span className="font-display text-[clamp(36px,5vw,56px)] text-accent leading-none">
              {usdcBalance || "0.00"}
            </span>
            <span className="font-mono text-lg text-muted ml-2">USDC</span>
          </div>
          <div>
            <span className="font-mono text-xs text-muted uppercase block mb-2">SOL Balance</span>
            <span className="font-display text-[clamp(36px,5vw,56px)] text-mint leading-none">
              {solBalance}
            </span>
            <span className="font-mono text-lg text-muted ml-2">SOL</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Tasks" value={String(totalTasks)} />
        <StatCard label="Completed" value={String(completed)} color="text-accent" />
        <StatCard label="USDC Spent" value={totalSpent.toFixed(2)} color="text-accent" />
        <StatCard label="My Agents" value={String(myAgentCount)} color="text-purple-400" />
      </div>

      {/* Identity Info */}
      <div className="grid grid-cols-2 gap-6">
        <div className="border border-mint/10 rounded-xl p-6">
          <span className="font-mono text-xs text-muted uppercase tracking-wider block mb-4">Identity</span>

          <div className="flex flex-col gap-4">
            <div>
              <span className="font-mono text-[10px] text-muted uppercase block mb-1">Wallet Address</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-mint break-all">{address}</span>
                <CopyButton text={address} />
              </div>
            </div>
            <div>
              <span className="font-mono text-[10px] text-muted uppercase block mb-1">DID (Decentralized Identifier)</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-mint break-all">{did || "Not generated"}</span>
                {did && <CopyButton text={did} />}
              </div>
            </div>
          </div>
        </div>

        {/* Twin Preferences */}
        <div className="border border-mint/10 rounded-xl p-6">
          <span className="font-mono text-xs text-muted uppercase tracking-wider block mb-4">Twin Preferences</span>
          <div className="flex flex-col gap-4">
            <div>
              <MonoLabel className="mb-1">Response Language</MonoLabel>
              <select value={prefLang} onChange={(e) => setPrefLang(e.target.value)}
                className="w-full bg-forest-deep/30 border border-mint/20 rounded-lg px-3 py-2 font-mono text-sm text-mint focus:border-mint/40 focus:outline-none cursor-pointer">
                <option value="auto">Auto (match input language)</option>
                <option value="tr">Turkish</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <MonoLabel className="mb-1">Detail Level</MonoLabel>
              <select value={prefDetail} onChange={(e) => setPrefDetail(e.target.value)}
                className="w-full bg-forest-deep/30 border border-mint/20 rounded-lg px-3 py-2 font-mono text-sm text-mint focus:border-mint/40 focus:outline-none cursor-pointer">
                <option value="short">Short — concise, to the point</option>
                <option value="medium">Medium — balanced</option>
                <option value="detailed">Detailed — comprehensive analysis</option>
              </select>
            </div>
            <div>
              <MonoLabel className="mb-1">Custom Instructions for Twin</MonoLabel>
              <textarea value={prefInstructions} onChange={(e) => setPrefInstructions(e.target.value)}
                placeholder="e.g. I'm interested in DeFi and Solana ecosystem. Always include risk scores."
                rows={3}
                className="w-full bg-forest-deep/30 border border-mint/20 rounded-lg px-3 py-2 font-mono text-sm text-mint placeholder:text-muted/40 focus:border-mint/40 focus:outline-none resize-none" />
            </div>
            <button onClick={savePrefs} disabled={prefsSaving}
              className="self-start font-mono text-xs text-bg-base bg-mint px-4 py-2 rounded-lg hover:bg-accent transition-colors disabled:opacity-50">
              {prefsSaving ? "Saving..." : "Save Preferences"}
            </button>
          </div>
        </div>
      </div>

      {/* Agent Memories */}
      <AgentMemories wallet={address} />

      {/* Quick Links */}
      <div className="grid grid-cols-2 gap-6 mt-6">
        <div className="border border-mint/10 rounded-xl p-6 col-span-2">
          <span className="font-mono text-xs text-muted uppercase tracking-wider block mb-4">Quick Links</span>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => router.push("/my-agents")}
              className="text-left p-4 border border-forest-deep/40 rounded-lg hover:border-mint/20 hover:bg-forest-deep/20 transition-all group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-mono text-sm text-off-white group-hover:text-mint transition-colors">My Agents</span>
                  <p className="font-mono text-[10px] text-muted mt-0.5">{myAgentCount} registered on-chain</p>
                </div>
                <span className="font-mono text-xs text-muted group-hover:text-mint">→</span>
              </div>
            </button>
            <button
              onClick={() => router.push("/marketplace")}
              className="text-left p-4 border border-forest-deep/40 rounded-lg hover:border-mint/20 hover:bg-forest-deep/20 transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-off-white group-hover:text-mint transition-colors">Marketplace</span>
                <span className="font-mono text-xs text-muted group-hover:text-mint">→</span>
              </div>
            </button>
            <button
              onClick={() => router.push("/log")}
              className="text-left p-4 border border-forest-deep/40 rounded-lg hover:border-mint/20 hover:bg-forest-deep/20 transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-off-white group-hover:text-mint transition-colors">Task History</span>
                <span className="font-mono text-xs text-muted group-hover:text-mint">→</span>
              </div>
            </button>
            <a
              href={`https://explorer.solana.com/address/${address}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-left p-4 border border-forest-deep/40 rounded-lg hover:border-mint/20 hover:bg-forest-deep/20 transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-off-white group-hover:text-mint transition-colors">Solana Explorer</span>
                <span className="font-mono text-xs text-muted group-hover:text-mint">↗</span>
              </div>
            </a>
            <button
              onClick={handleDisconnect}
              className="w-full text-left p-4 border border-red-800/30 rounded-lg hover:border-red-600/40 hover:bg-red-900/10 transition-all group mt-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-red-400 group-hover:text-red-300 transition-colors">Disconnect Wallet</span>
                <span className="font-mono text-xs text-red-400/60 group-hover:text-red-300">✕</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Agent Memories Section                                             */
/* ------------------------------------------------------------------ */

interface MemoryEntry {
  id: string;
  agent_did: string;
  memory_type: string;
  content: string;
  created_at?: string;
}

function AgentMemories({ wallet }: { wallet: string }) {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMemories = useCallback(() => {
    setLoading(true);
    signedFetch(`/api/memory?wallet=${wallet}`)
      .then((r) => r.json())
      .then((d) => setMemories(d.memories ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [wallet]);

  useEffect(() => { loadMemories(); }, [loadMemories]);

  const handleDelete = async (id: string) => {
    await signedFetch(`/api/memory?id=${id}`, { method: "DELETE" });
    loadMemories();
  };

  const handleClearAll = async () => {
    await signedFetch(`/api/memory?wallet=${wallet}&all=true`, { method: "DELETE" });
    loadMemories();
  };

  // Group by agent
  const grouped = memories.reduce<Record<string, MemoryEntry[]>>((acc, m) => {
    (acc[m.agent_did] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div className="border border-mint/10 rounded-xl p-6 mt-6">
      <div className="flex items-center justify-between mb-4">
        <span className="font-mono text-xs text-muted uppercase tracking-wider">Agent Memories</span>
        {memories.length > 0 && (
          <button onClick={handleClearAll}
            className="font-mono text-[10px] text-red-400 hover:text-red-300 transition-colors">
            Clear All
          </button>
        )}
      </div>

      {loading ? (
        <p className="font-mono text-xs text-muted animate-pulse">Loading memories...</p>
      ) : memories.length === 0 ? (
        <p className="font-mono text-xs text-muted">
          No memories yet. Agents learn about your preferences as you interact with them.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {Object.entries(grouped).map(([agentDid, entries]) => (
            <div key={agentDid} className="border border-forest-deep/40 rounded-lg p-4">
              <span className="font-mono text-[10px] text-mint uppercase block mb-2">
                {agentDid.length > 30 ? agentDid.slice(0, 20) + "..." : agentDid}
              </span>
              <div className="flex flex-col gap-1.5">
                {entries.map((m) => (
                  <div key={m.id} className="flex items-start justify-between gap-2 group">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className={`font-mono text-[9px] uppercase px-1 py-0.5 rounded shrink-0 ${
                        m.memory_type === "preference" ? "text-accent bg-accent/10" :
                        m.memory_type === "fact" ? "text-purple-400 bg-purple-900/10" :
                        "text-muted bg-forest-deep/30"
                      }`}>
                        {m.memory_type}
                      </span>
                      <span className="font-mono text-xs text-body">{m.content}</span>
                    </div>
                    <button onClick={() => handleDelete(m.id)}
                      className="font-mono text-[9px] text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      delete
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
