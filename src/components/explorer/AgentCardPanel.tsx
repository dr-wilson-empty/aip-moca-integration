"use client";

import { useState } from "react";
import type { AgentCard, AgentType } from "@/types/aip";
import MonoLabel from "@/components/ui/MonoLabel";

interface Props {
  card: AgentCard;
  title: string;
  verified: boolean;
}

function TypeBadge({ type }: { type: AgentType }) {
  const styles: Record<AgentType, string> = {
    LLM: "border-blue-800/40 text-blue-400 bg-blue-900/10",
    Task: "border-accent/40 text-accent bg-accent/10",
    Execution: "border-yellow-800/40 text-yellow-400 bg-yellow-900/10",
  };
  return (
    <span className={`font-mono text-[9px] uppercase px-2 py-0.5 border ${styles[type]}`}>
      {type} Agent
    </span>
  );
}

export default function AgentCardPanel({ card, title, verified }: Props) {
  const [viewMode, setViewMode] = useState<"visual" | "json">("visual");

  const cardJson = JSON.stringify(card, null, 2);

  return (
    <div className="border border-forest-deep/60 bg-forest-deep/20 p-6 flex flex-col gap-5 h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-forest-deep/40 pb-4">
        <div className="flex items-center gap-3">
          <MonoLabel className="text-accent !mb-0">{title}</MonoLabel>
          <TypeBadge type={card.type} />
        </div>
        <span
          className={`font-mono text-[10px] uppercase px-2 py-1 border ${
            verified
              ? "border-accent/40 text-accent bg-accent/10"
              : "border-red-800/40 text-red-400 bg-red-900/10"
          }`}
        >
          {verified ? "DID Verified ✓" : "DID Unverified ✗"}
        </span>
      </div>

      {/* View toggle */}
      <div className="flex gap-0 self-start">
        <button
          onClick={() => setViewMode("visual")}
          className={`font-mono text-[9px] uppercase tracking-wider px-3 py-1.5 border transition-colors ${
            viewMode === "visual"
              ? "border-accent/40 text-accent bg-accent/10"
              : "border-forest-deep/60 text-muted hover:text-off-white"
          }`}
        >
          Visual
        </button>
        <button
          onClick={() => setViewMode("json")}
          className={`font-mono text-[9px] uppercase tracking-wider px-3 py-1.5 border border-l-0 transition-colors ${
            viewMode === "json"
              ? "border-accent/40 text-accent bg-accent/10"
              : "border-forest-deep/60 text-muted hover:text-off-white"
          }`}
        >
          JSON
        </button>
      </div>

      {viewMode === "visual" ? (
        <div className="flex flex-col gap-4">
          <div>
            <MonoLabel className="mb-1">Agent Name</MonoLabel>
            <p className="font-display text-off-white text-lg uppercase tracking-wider">
              {card.name}
            </p>
          </div>

          <div>
            <MonoLabel className="mb-1">DID</MonoLabel>
            <p className="font-mono text-[10px] text-accent break-all leading-relaxed">
              {card.did}
            </p>
          </div>

          <div>
            <MonoLabel className="mb-1">Endpoint</MonoLabel>
            <p className="font-mono text-xs text-body">{card.endpoint}</p>
          </div>

          <div>
            <MonoLabel className="mb-2">Capabilities</MonoLabel>
            <div className="flex flex-col gap-2">
              {card.capabilities.map((cap) => (
                <div
                  key={cap.id}
                  className="border border-forest-deep/60 p-3 flex items-start justify-between gap-4 hover:border-accent/30 transition-colors"
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-[11px] text-accent uppercase">
                      {cap.id}
                    </span>
                    <span className="font-mono text-[10px] text-muted">
                      {cap.description}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-off-white whitespace-nowrap">
                    {cap.pricing.amount} {cap.pricing.token}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-auto">
            <MonoLabel className="mb-1">Version</MonoLabel>
            <p className="font-mono text-xs text-muted">{card.version}</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <pre className="font-mono text-[10px] text-body leading-relaxed overflow-x-auto bg-bg-base/50 border border-forest-deep/40 p-4 max-h-[400px] overflow-y-auto">
            <code>{cardJson}</code>
          </pre>
          <p className="font-mono text-[9px] text-muted mt-2">
            A2A-compatible Agent Card — JSON-RPC 2.0
          </p>
        </div>
      )}
    </div>
  );
}
