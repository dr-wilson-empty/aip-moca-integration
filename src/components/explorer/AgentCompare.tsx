"use client";

import { useState } from "react";
import type { AgentCard, AgentType } from "@/types/aip";
import MonoLabel from "@/components/ui/MonoLabel";

interface Props {
  myCard: AgentCard;
  counterpartCard: AgentCard;
}

function TypeLabel({ type }: { type: AgentType }) {
  const styles: Record<AgentType, string> = {
    LLM: "text-blue-400",
    Task: "text-accent",
    Execution: "text-yellow-400",
  };
  return <span className={`font-mono text-[9px] uppercase ${styles[type]}`}>{type}</span>;
}

/** Bar visualization inspired by react-app.js ChartVis */
function MetricBar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const [hovered, setHovered] = useState(false);
  const pct = Math.min(100, (value / max) * 100);

  return (
    <div
      className="flex items-center gap-3 group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className="font-mono text-[9px] text-muted uppercase w-20 shrink-0">{label}</span>
      <div className="flex-1 h-3 bg-forest-deep/40 relative overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%`, opacity: hovered ? 1 : 0.6 }}
        />
      </div>
      <span className={`font-mono text-[10px] w-8 text-right transition-colors ${hovered ? "text-off-white" : "text-muted"}`}>
        {value}
      </span>
    </div>
  );
}

export default function AgentCompare({ myCard, counterpartCard }: Props) {
  // Build comparison metrics from card data
  const myCapCount = myCard.capabilities.length;
  const cpCapCount = counterpartCard.capabilities.length;
  const maxCaps = Math.max(myCapCount, cpCapCount, 1);

  const myAvgPrice = myCard.capabilities.reduce((s, c) => s + parseFloat(c.pricing.amount), 0) / myCapCount;
  const cpAvgPrice = counterpartCard.capabilities.reduce((s, c) => s + parseFloat(c.pricing.amount), 0) / cpCapCount;
  const maxPrice = Math.max(myAvgPrice, cpAvgPrice, 0.01);

  // Shared capabilities
  const myCapIds = new Set(myCard.capabilities.map((c) => c.id));
  const cpCapIds = new Set(counterpartCard.capabilities.map((c) => c.id));
  const shared = Array.from(myCapIds).filter((id) => cpCapIds.has(id));

  return (
    <div className="border border-forest-deep/40 bg-forest-deep/10">
      <div className="px-6 py-4 border-b border-forest-deep/40">
        <MonoLabel className="text-accent !mb-0">Agent Comparison</MonoLabel>
      </div>

      <div className="p-6 grid grid-cols-2 gap-8">
        {/* Left: My Agent */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-forest-deep/30 pb-2">
            <span className="font-display text-sm text-off-white uppercase tracking-wider">
              {myCard.name}
            </span>
            <TypeLabel type={myCard.type} />
          </div>
          <MetricBar label="Capabilities" value={myCapCount} max={maxCaps} color="bg-accent" />
          <MetricBar label="Avg Price" value={parseFloat(myAvgPrice.toFixed(2))} max={maxPrice} color="bg-yellow-400" />
          <MetricBar label="Version" value={parseFloat(myCard.version)} max={3} color="bg-blue-400" />
        </div>

        {/* Right: Counterpart */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-forest-deep/30 pb-2">
            <span className="font-display text-sm text-off-white uppercase tracking-wider">
              {counterpartCard.name}
            </span>
            <TypeLabel type={counterpartCard.type} />
          </div>
          <MetricBar label="Capabilities" value={cpCapCount} max={maxCaps} color="bg-accent" />
          <MetricBar label="Avg Price" value={parseFloat(cpAvgPrice.toFixed(2))} max={maxPrice} color="bg-yellow-400" />
          <MetricBar label="Version" value={parseFloat(counterpartCard.version)} max={3} color="bg-blue-400" />
        </div>
      </div>

      {/* Shared Capabilities */}
      <div className="px-6 pb-5 pt-0">
        <div className="border-t border-forest-deep/40 pt-4">
          <div className="flex items-center justify-between mb-3">
            <MonoLabel className="!mb-0">Capability Overlap</MonoLabel>
            <span className="font-mono text-[10px] text-accent">
              {shared.length} shared
            </span>
          </div>

          {/* Visual capability bars — inspired by react-app.js ChartVis */}
          <div className="flex items-end gap-[2px] h-16">
            {myCard.capabilities.map((cap) => {
              const isShared = cpCapIds.has(cap.id);
              const price = parseFloat(cap.pricing.amount);
              const hPct = Math.min(100, (price / 1) * 100);
              return (
                <div
                  key={`my-${cap.id}`}
                  className="flex-1 group relative"
                  title={`${myCard.name}: ${cap.id} — ${cap.pricing.amount} USDC`}
                >
                  <div
                    className={`w-full transition-opacity duration-200 ${isShared ? "bg-accent" : "bg-accent/40"} group-hover:opacity-100 opacity-40`}
                    style={{ height: `${hPct}%`, minHeight: "4px" }}
                  />
                </div>
              );
            })}
            <div className="w-px h-full bg-forest-mid/40 mx-1" />
            {counterpartCard.capabilities.map((cap) => {
              const isShared = myCapIds.has(cap.id);
              const price = parseFloat(cap.pricing.amount);
              const hPct = Math.min(100, (price / 1) * 100);
              return (
                <div
                  key={`cp-${cap.id}`}
                  className="flex-1 group relative"
                  title={`${counterpartCard.name}: ${cap.id} — ${cap.pricing.amount} USDC`}
                >
                  <div
                    className={`w-full transition-opacity duration-200 ${isShared ? "bg-blue-400" : "bg-blue-400/40"} group-hover:opacity-100 opacity-40`}
                    style={{ height: `${hPct}%`, minHeight: "4px" }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1">
            <span className="font-mono text-[8px] text-accent">{myCard.name}</span>
            <span className="font-mono text-[8px] text-blue-400">{counterpartCard.name}</span>
          </div>

          {/* Shared list */}
          {shared.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {shared.map((id) => (
                <span
                  key={id}
                  className="font-mono text-[9px] text-accent px-2 py-1 border border-accent/30 bg-accent/5"
                >
                  {id}
                </span>
              ))}
            </div>
          )}
          {shared.length === 0 && (
            <p className="font-mono text-[9px] text-muted mt-2">
              No overlapping capabilities — agents are complementary.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
