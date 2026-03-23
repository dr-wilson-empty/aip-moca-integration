"use client";

import { useState } from "react";
import { useAgentStore } from "@/store/agentStore";
import { COUNTERPART_AGENT_CARDS } from "@/lib/mock/agentCards";
import type { AgentCard, AgentType } from "@/types/aip";

const AGENTS = Object.entries(COUNTERPART_AGENT_CARDS);

function TypeDot({ type }: { type: AgentType }) {
  const color = { LLM: "bg-blue-400", Task: "bg-accent", Execution: "bg-yellow-400" };
  return <span className={`w-2 h-2 rounded-full ${color[type]}`} />;
}

export default function FetchPanel() {
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [loadingEp, setLoadingEp] = useState("");
  const { counterpartCard, setCounterpart } = useAgentStore();

  const doFetch = async (endpoint: string, card: AgentCard) => {
    setLoadingEp(endpoint);
    setStatus("loading");
    await new Promise((r) => setTimeout(r, 600));
    setCounterpart(card);
    setStatus("success");
  };

  return (
    <div className="flex flex-col gap-3">
      <span className="font-mono text-xs text-muted uppercase">
        {counterpartCard ? "Switch Agent" : "Select an Agent"}
      </span>
      <div className="flex flex-col gap-2">
        {AGENTS.map(([ep, card]) => {
          const isSelected = counterpartCard?.endpoint === ep;
          const isLoading = status === "loading" && loadingEp === ep;

          return (
            <button
              key={ep}
              onClick={() => doFetch(ep, card)}
              disabled={isLoading}
              className={`text-left p-4 border transition-all duration-200 flex items-start gap-4 group ${
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
                  <span className="font-mono text-[11px] text-muted uppercase">{card.type}</span>
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
