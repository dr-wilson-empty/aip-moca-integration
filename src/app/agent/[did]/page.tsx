"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAgentStore } from "@/store/agentStore";
import { useWalletStore } from "@/store/walletStore";
import type { AgentType, Capability } from "@/types/aip";
import BtnPrimary from "@/components/ui/BtnPrimary";

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

function TypeBadge({ type }: { type: AgentType }) {
  const styles: Record<AgentType, string> = {
    LLM: "border-blue-800/40 text-blue-400 bg-blue-900/10",
    Task: "border-accent/40 text-accent bg-accent/10",
    Execution: "border-yellow-800/40 text-yellow-400 bg-yellow-900/10",
  };
  return (
    <span className={`font-mono text-xs uppercase px-3 py-1 border rounded ${styles[type]}`}>
      {type}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="font-mono text-[10px] text-muted hover:text-mint transition-colors ml-2">
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function InfoRow({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  return (
    <div className="flex flex-col gap-1 py-3 border-b border-forest-deep/30">
      <span className="font-mono text-[10px] text-muted uppercase tracking-wider">{label}</span>
      <div className="flex items-center">
        <span className="font-mono text-sm text-mint break-all">{value}</span>
        {copyable && <CopyButton text={value} />}
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

  useEffect(() => {
    fetch(`/api/agent-card/detail?did=${encodeURIComponent(did)}`)
      .then((r) => {
        if (!r.ok) throw new Error("Agent not found");
        return r.json();
      })
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
    await fetch("/api/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentDid: did, walletAddress: address, rating: myRating, comment: myComment }),
    });
    setRatingSubmitted(true);
    // Refresh ratings
    const res = await fetch(`/api/ratings?agentDid=${encodeURIComponent(did)}`);
    setRatings(await res.json());
  };

  const handleStartTask = () => {
    if (!agent) return;
    setCounterpart({
      did: agent.did,
      name: agent.name,
      version: agent.version,
      endpoint: agent.endpoint,
      type: agent.type,
      capabilities: agent.capabilities,
      walletAddress: agent.walletAddress,
    });
    router.push("/dashboard");
  };

  if (loading) {
    return (
      <div className="max-w-[1920px] mx-auto px-10 py-12 flex items-center justify-center min-h-[60vh]">
        <span className="font-mono text-sm text-muted animate-pulse">Loading agent...</span>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="max-w-[1920px] mx-auto px-10 py-12 flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <span className="font-mono text-sm text-red-400">{error || "Agent not found"}</span>
        <button onClick={() => router.push("/marketplace")} className="font-mono text-xs text-muted hover:text-mint">
          Back to Marketplace
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[1920px] mx-auto px-10 py-12">
      {/* Breadcrumb */}
      <div className="mb-8">
        <button onClick={() => router.push("/marketplace")} className="font-mono text-xs text-muted hover:text-mint transition-colors">
          ← Marketplace
        </button>
      </div>

      {/* Hero */}
      <div className="border border-mint/20 rounded-2xl p-10 mb-8 bg-gradient-to-br from-forest-deep/20 to-transparent">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-3">
              <h1 className="font-display text-4xl text-mint uppercase tracking-tight">
                {agent.name}
              </h1>
              <TypeBadge type={agent.type} />
              {agent.onChain && (
                <span className="font-mono text-[10px] uppercase px-2.5 py-1 border rounded border-purple-800/40 text-purple-400 bg-purple-900/10">
                  On-chain Verified
                </span>
              )}
            </div>
            <p className="font-mono text-sm text-muted mb-1">
              {agent.capabilities.length} capabilities — v{agent.version}
            </p>
            {agent.agentId && (
              <p className="font-mono text-xs text-muted/50">
                ID: {agent.agentId}
              </p>
            )}
          </div>
          <BtnPrimary onClick={handleStartTask}>
            Start Task
            <span>→</span>
          </BtnPrimary>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Info */}
        <div className="col-span-2 border border-mint/10 rounded-xl p-6">
          <span className="font-mono text-xs text-muted uppercase tracking-wider block mb-2">Agent Information</span>

          <InfoRow label="DID" value={agent.did} copyable />
          <InfoRow label="Endpoint" value={agent.endpoint} copyable />
          {agent.walletAddress && <InfoRow label="Payment Wallet" value={agent.walletAddress} copyable />}
          {agent.owner && <InfoRow label="Owner" value={agent.owner} copyable />}

          {/* Capabilities */}
          <div className="mt-8">
            <span className="font-mono text-xs text-muted uppercase tracking-wider block mb-4">Capabilities</span>
            <div className="grid grid-cols-1 gap-3">
              {agent.capabilities.map((cap) => (
                <div key={cap.id} className="border border-mint/10 rounded-lg p-4 flex items-center justify-between hover:border-mint/20 transition-colors">
                  <div>
                    <span className="font-display text-sm text-off-white uppercase tracking-wider">
                      {cap.description}
                    </span>
                    <p className="font-mono text-[10px] text-muted/60 mt-0.5">{cap.id}</p>
                  </div>
                  <span className="font-mono text-sm text-accent whitespace-nowrap">
                    {cap.pricing.amount} USDC
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Quick Actions + On-chain Info */}
        <div className="flex flex-col gap-4">
          {/* Quick task */}
          <div className="border border-mint/10 rounded-xl p-6">
            <span className="font-mono text-xs text-muted uppercase tracking-wider block mb-4">Quick Task</span>
            <p className="font-mono text-xs text-muted mb-4">
              Select a capability and start a task with this agent.
            </p>
            {agent.capabilities.map((cap) => (
              <button
                key={cap.id}
                onClick={handleStartTask}
                className="w-full text-left p-3 border border-forest-deep/40 rounded-lg mb-2 hover:border-mint/20 hover:bg-forest-deep/20 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-off-white group-hover:text-mint transition-colors">
                    {cap.description}
                  </span>
                  <span className="font-mono text-[10px] text-accent">{cap.pricing.amount} USDC</span>
                </div>
              </button>
            ))}
          </div>

          {/* On-chain info */}
          {agent.onChain && (
            <div className="border border-purple-800/20 rounded-xl p-6 bg-purple-900/5">
              <span className="font-mono text-xs text-purple-400 uppercase tracking-wider block mb-3">On-chain Record</span>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between">
                  <span className="font-mono text-[10px] text-muted">Status</span>
                  <span className="font-mono text-[10px] text-purple-400">Verified</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-mono text-[10px] text-muted">Network</span>
                  <span className="font-mono text-[10px] text-muted">Solana Devnet</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-mono text-[10px] text-muted">Program</span>
                  <span className="font-mono text-[10px] text-muted">CgchXu...p1Vbc</span>
                </div>
              </div>
            </div>
          )}

          {/* Agent Card JSON */}
          <div className="border border-mint/10 rounded-xl p-6">
            <span className="font-mono text-xs text-muted uppercase tracking-wider block mb-3">Agent Card (JSON)</span>
            <pre className="font-mono text-[10px] text-body bg-bg-base/50 border border-mint/10 p-3 rounded-lg overflow-x-auto max-h-[200px] overflow-y-auto">
              {JSON.stringify({
                did: agent.did,
                name: agent.name,
                version: agent.version,
                endpoint: agent.endpoint,
                type: agent.type,
                capabilities: agent.capabilities,
                walletAddress: agent.walletAddress,
              }, null, 2)}
            </pre>
          </div>
        </div>
      </div>

      {/* Ratings Section */}
      <div className="mt-8 border border-mint/10 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="font-mono text-xs text-muted uppercase tracking-wider">Ratings & Reviews</span>
          {ratings.count > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-yellow-400 text-lg">{"★".repeat(Math.round(ratings.avg))}{"☆".repeat(5 - Math.round(ratings.avg))}</span>
              <span className="font-mono text-sm text-mint">{ratings.avg.toFixed(1)}</span>
              <span className="font-mono text-xs text-muted">({ratings.count} reviews)</span>
            </div>
          )}
        </div>

        {/* Submit rating */}
        {address && !ratingSubmitted ? (
          <div className="border border-forest-deep/40 rounded-lg p-4 mb-4">
            <span className="font-mono text-xs text-muted block mb-2">Rate this agent</span>
            <div className="flex items-center gap-1 mb-3">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setMyRating(n)}
                  className={`text-2xl transition-colors ${n <= myRating ? "text-yellow-400" : "text-forest-deep hover:text-yellow-400/50"}`}>
                  ★
                </button>
              ))}
              {myRating > 0 && <span className="font-mono text-xs text-muted ml-2">{myRating}/5</span>}
            </div>
            <textarea value={myComment} onChange={(e) => setMyComment(e.target.value)}
              placeholder="Optional comment..."
              rows={2}
              className="w-full bg-forest-deep/30 border border-mint/10 rounded px-3 py-2 font-mono text-xs text-mint placeholder:text-muted/40 focus:border-mint/30 focus:outline-none resize-none mb-2" />
            <button onClick={submitRating} disabled={myRating < 1}
              className="font-mono text-xs text-bg-base bg-mint px-4 py-1.5 rounded hover:bg-accent transition-colors disabled:opacity-40">
              Submit Rating
            </button>
          </div>
        ) : ratingSubmitted ? (
          <p className="font-mono text-xs text-accent mb-4">Thanks for your rating!</p>
        ) : null}

        {/* Reviews list */}
        {ratings.ratings.length > 0 ? (
          <div className="flex flex-col gap-3">
            {ratings.ratings.map((r, i) => (
              <div key={i} className="border-b border-forest-deep/20 pb-3 last:border-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-yellow-400 text-sm">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                  <span className="font-mono text-[10px] text-muted">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                {r.comment && <p className="font-mono text-xs text-body">{r.comment}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="font-mono text-xs text-muted">No reviews yet. Be the first to rate this agent.</p>
        )}
      </div>
    </div>
  );
}
