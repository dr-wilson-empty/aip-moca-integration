"use client";

import { useState, useEffect, useCallback } from "react";
import { useAgentStore } from "@/store/agentStore";
import type { AgentCard, AgentType } from "@/types/aip";

function TypeDot({ type }: { type: AgentType }) {
  const color = { LLM: "bg-blue-400", Task: "bg-accent", Execution: "bg-yellow-400" };
  return <span className={`w-2 h-2 rounded-full ${color[type]}`} />;
}

export default function FetchPanel() {
  const [agents, setAgents] = useState<(AgentCard & { onChain?: boolean })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const { counterpartCard, setCounterpart } = useAgentStore();

  const loadAgents = useCallback(() => {
    setLoading(true);
    fetch("/api/agent-card?list=true")
      .then((res) => res.json())
      .then((data) => setAgents(data.agents ?? []))
      .catch((err) => console.error("[FetchPanel]", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadAgents(); }, [loadAgents]);

  const selectAgent = (card: AgentCard) => {
    setCounterpart(card);
  };

  // Filter agents
  const filtered = agents.filter((card) => {
    const matchSearch =
      !search ||
      card.name.toLowerCase().includes(search.toLowerCase()) ||
      card.capabilities.some((c) =>
        c.id.toLowerCase().includes(search.toLowerCase()) ||
        c.description.toLowerCase().includes(search.toLowerCase())
      );
    const matchType = filterType === "all" || card.type === filterType;
    return matchSearch && matchType;
  });

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <span className="font-mono text-xs text-muted uppercase">Loading agents...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted uppercase">
          {counterpartCard ? "Switch Agent" : "Select an Agent"}
          <span className="text-mint ml-2">{filtered.length} found</span>
        </span>
        <button
          onClick={loadAgents}
          className="font-mono text-[10px] text-muted uppercase hover:text-mint transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search agents or capabilities..."
          className="flex-1 bg-bg-base border border-mint/15 rounded px-3 py-1.5 font-mono text-xs text-mint placeholder:text-muted/40 focus:border-mint/30 focus:outline-none"
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="bg-bg-base border border-mint/15 rounded px-2 py-1.5 font-mono text-xs text-muted focus:border-mint/30 focus:outline-none"
        >
          <option value="all">All</option>
          <option value="LLM">LLM</option>
          <option value="Task">Task</option>
          <option value="Execution">Execution</option>
        </select>
      </div>

      {/* Agent list */}
      <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="font-mono text-xs text-muted py-4 text-center">
            {agents.length === 0
              ? "No agents registered. Be the first to register one!"
              : "No agents match your search."}
          </p>
        ) : (
          filtered.map((card) => {
            const isSelected = counterpartCard?.did === card.did;

            return (
              <button
                key={card.did}
                onClick={() => selectAgent(card)}
                className={`text-left p-4 border rounded-lg transition-all duration-200 flex items-start gap-4 group ${
                  isSelected
                    ? "border-mint/40 bg-mint/5"
                    : "border-forest-deep/40 hover:border-mint/20 hover:bg-forest-deep/30"
                }`}
              >
                <div className="mt-1.5">
                  {isSelected ? (
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
                  <p className="font-mono text-[10px] text-muted/60 mt-1 truncate">{card.endpoint}</p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
