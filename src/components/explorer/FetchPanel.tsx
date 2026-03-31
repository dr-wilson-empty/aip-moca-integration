"use client";

import { useState, useEffect } from "react";
import { useAgentStore } from "@/store/agentStore";
import type { AgentCard, AgentType } from "@/types/aip";

function TypeDot({ type }: { type: AgentType }) {
  const color = { LLM: "bg-blue-400", Task: "bg-accent", Execution: "bg-yellow-400" };
  return <span className={`w-2 h-2 rounded-full ${color[type]}`} />;
}

export default function FetchPanel() {
  const [agents, setAgents] = useState<(AgentCard & { onChain?: boolean })[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingEp, setFetchingEp] = useState("");
  const { counterpartCard, setCounterpart } = useAgentStore();

  // API'den agent listesini cek
  useEffect(() => {
    fetch("/api/agent-card?list=true")
      .then((res) => res.json())
      .then((data) => setAgents(data.agents ?? []))
      .catch((err) => console.error("[FetchPanel]", err))
      .finally(() => setLoading(false));
  }, []);

  const doFetch = async (endpoint: string, card: AgentCard) => {
    setFetchingEp(endpoint);
    try {
      const res = await fetch(`/api/agent-card/fetch?url=${encodeURIComponent(endpoint)}`);
      const data = await res.json();
      if (data.card) {
        setCounterpart(data.card);
      }
    } catch (err) {
      console.error("[FetchPanel] fetch error:", err);
    }
    setFetchingEp("");
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <span className="font-mono text-xs text-muted uppercase">Loading agents...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="font-mono text-xs text-muted uppercase">
        {counterpartCard ? "Switch Agent" : "Select an Agent"}
      </span>
      <div className="flex flex-col gap-2">
        {agents.map((card) => {
          const ep = card.endpoint;
          const isSelected = counterpartCard?.endpoint === ep;
          const isLoading = fetchingEp === ep;

          return (
            <button
              key={ep}
              onClick={() => doFetch(ep, card)}
              disabled={isLoading}
              className={`text-left p-4 border rounded-lg transition-all duration-200 flex items-start gap-4 group ${
                isSelected
                  ? "border-mint/40 bg-mint/5"
                  : "border-forest-deep/40 hover:border-mint/20 hover:bg-forest-deep/30"
              }`}
            >
              <div className="mt-1.5">
                {isLoading ? (
                  <span className="w-2 h-2 border border-accent border-t-transparent rounded-full animate-spin-slow block" />
                ) : isSelected ? (
                  <span className="w-2 h-2 rounded-full bg-accent" />
                ) : (
                  <TypeDot type={card.type} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`font-display text-sm uppercase tracking-wider ${isSelected ? "text-mint" : "text-off-white group-hover:text-mint"} transition-colors`}>
                    {card.name}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {card.onChain && (
                      <span className="font-mono text-[10px] uppercase px-1.5 py-0.5 border rounded border-purple-800/40 text-purple-400 bg-purple-900/10">
                        on-chain
                      </span>
                    )}
                    <span className="font-mono text-[11px] text-muted uppercase">{card.type}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {card.capabilities.map((cap) => (
                    <span key={cap.id} className="font-mono text-xs text-muted">
                      {cap.description}
                      <span className="text-accent ml-1">{cap.pricing.amount} USDC</span>
                    </span>
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
