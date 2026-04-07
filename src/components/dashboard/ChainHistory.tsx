"use client";

import { useState, useEffect } from "react";
import { useWalletStore } from "@/store/walletStore";

interface ChainStep {
  agentName: string;
  capabilityId: string;
  estimatedCost: string;
  status: string;
  artifact?: string;
  escrowTxHash?: string;
  settlementTxHash?: string;
  error?: string;
}

interface Chain {
  id: string;
  status: string;
  totalCost: string;
  totalSpent: string;
  currentStep: number;
  steps: ChainStep[];
  createdAt: string;
  completedAt?: string;
  finalArtifact?: string;
}

const STATUS_STYLES: Record<string, string> = {
  completed: "text-accent border-accent/30 bg-accent/10",
  failed: "text-red-400 border-red-800/30 bg-red-900/10",
  executing: "text-blue-400 border-blue-800/30 bg-blue-900/10",
  pending: "text-muted border-forest-deep/30 bg-forest-deep/10",
};

function StepDot({ status }: { status: string }) {
  if (status === "completed") return <span className="w-3 h-3 rounded-full bg-accent shrink-0" />;
  if (status === "executing") return <span className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin shrink-0" />;
  if (status === "failed") return <span className="w-3 h-3 rounded-full bg-red-500 shrink-0" />;
  return <span className="w-3 h-3 rounded-full border border-forest-deep shrink-0" />;
}

export default function ChainHistory() {
  const { address } = useWalletStore();
  const [chains, setChains] = useState<Chain[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    fetch(`/api/chain?caller=${encodeURIComponent(address)}`)
      .then((r) => r.json())
      .then((d) => setChains(d.chains ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [address]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (!address) return null;

  return (
    <div className="border border-forest-deep/40 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-sm text-mint uppercase tracking-wider">Pipeline History</h3>
        <span className="font-mono text-[10px] text-muted">{chains.length} pipelines</span>
      </div>

      {loading ? (
        <p className="font-mono text-xs text-muted animate-pulse py-4 text-center">Loading...</p>
      ) : chains.length === 0 ? (
        <p className="font-mono text-xs text-muted py-4 text-center">No pipelines yet. Run one from Twin.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {chains.map((chain) => (
            <div key={chain.id} className="border border-forest-deep/30 rounded-lg overflow-hidden">
              {/* Chain header */}
              <button
                onClick={() => toggle(chain.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-forest-deep/20 transition-colors"
              >
                <span className={`font-mono text-[9px] uppercase px-2 py-0.5 border rounded ${STATUS_STYLES[chain.status] || STATUS_STYLES.pending}`}>
                  {chain.status}
                </span>
                <span className="font-mono text-xs text-off-white flex-1 text-left">
                  {chain.steps.length} steps
                </span>
                <span className="font-mono text-xs text-accent">
                  {chain.totalSpent !== "0.00" ? chain.totalSpent : chain.totalCost} USDC
                </span>
                <span className="font-mono text-[10px] text-muted">
                  {new Date(chain.createdAt).toLocaleTimeString()}
                </span>
                <span className="font-mono text-[10px] text-muted">
                  {expanded.has(chain.id) ? "▾" : "▸"}
                </span>
              </button>

              {/* Expanded steps */}
              {expanded.has(chain.id) && (
                <div className="px-4 pb-3 border-t border-forest-deep/20">
                  <div className="flex flex-col gap-1.5 mt-2">
                    {chain.steps.map((step, i) => (
                      <div key={i} className="flex items-center gap-3 py-1">
                        <StepDot status={step.status} />
                        <span className="font-mono text-[11px] text-muted w-4">{i + 1}.</span>
                        <span className="font-mono text-[11px] text-off-white flex-1">
                          {step.agentName}
                        </span>
                        <span className="font-mono text-[10px] text-muted">
                          {step.capabilityId}
                        </span>
                        <span className="font-mono text-[10px] text-accent">
                          {step.estimatedCost} USDC
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Chain footer */}
                  <div className="flex items-center gap-4 mt-3 pt-2 border-t border-forest-deep/15">
                    <span className="font-mono text-[10px] text-muted">
                      ID: {chain.id}
                    </span>
                    {chain.completedAt && (
                      <span className="font-mono text-[10px] text-muted">
                        Duration: {((new Date(chain.completedAt).getTime() - new Date(chain.createdAt).getTime()) / 1000).toFixed(1)}s
                      </span>
                    )}
                    <span className="font-mono text-[10px] text-accent ml-auto">
                      Total: {chain.totalSpent} USDC
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
