"use client";

import type { AgentCard } from "@/types/aip";
import MonoLabel from "@/components/ui/MonoLabel";

interface Props {
  myCard: AgentCard;
  counterpartCard: AgentCard;
}

export default function AgentCompare({ myCard, counterpartCard }: Props) {
  const myCapIds = new Set(myCard.capabilities.map((c) => c.id));
  const cpCapIds = new Set(counterpartCard.capabilities.map((c) => c.id));

  const shared = myCard.capabilities.filter((c) => cpCapIds.has(c.id));
  const onlyMine = myCard.capabilities.filter((c) => !cpCapIds.has(c.id));
  const onlyTheirs = counterpartCard.capabilities.filter((c) => !myCapIds.has(c.id));

  return (
    <div className="border border-mint/20 bg-forest-deep/10 px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <MonoLabel className="!mb-0">Capability Overlap</MonoLabel>
        <span className="font-mono text-xs text-accent">{shared.length} shared</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {shared.map((cap) => (
          <span
            key={cap.id}
            className="font-mono text-xs px-3 py-1.5 border border-accent/30 text-accent bg-accent/5"
          >
            {cap.description}
          </span>
        ))}
        {onlyMine.map((cap) => (
          <span
            key={cap.id}
            className="font-mono text-xs px-3 py-1.5 border border-mint/20 text-muted"
            title={`Only ${myCard.name}`}
          >
            {cap.description}
            <span className="text-mint/30 ml-1.5">you</span>
          </span>
        ))}
        {onlyTheirs.map((cap) => (
          <span
            key={cap.id}
            className="font-mono text-xs px-3 py-1.5 border border-blue-800/30 text-blue-400/70"
            title={`Only ${counterpartCard.name}`}
          >
            {cap.description}
            <span className="text-blue-400/30 ml-1.5">them</span>
          </span>
        ))}
      </div>

      {shared.length === 0 && (
        <p className="font-mono text-xs text-muted mt-1">
          No overlapping capabilities — agents are complementary.
        </p>
      )}
    </div>
  );
}
