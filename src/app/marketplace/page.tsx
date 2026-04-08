"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { AgentCard, AgentType } from "@/types/aip";

type SortKey = "name" | "price-low" | "price-high" | "capabilities" | "rating";

interface AgentWithMeta extends AgentCard {
  onChain?: boolean;
  avgRating?: number;
  ratingCount?: number;
  registeredAt?: number;
}

interface Category { id: string; name: string; icon: string; }

function TypeBadge({ type }: { type: AgentType }) {
  const styles: Record<AgentType, string> = {
    LLM: "border-blue-800/40 text-blue-400 bg-blue-900/10",
    Task: "border-accent/40 text-accent bg-accent/10",
    Execution: "border-yellow-800/40 text-yellow-400 bg-yellow-900/10",
  };
  return (
    <span className={`font-mono text-xs uppercase px-2 py-0.5 border rounded ${styles[type]}`}>
      {type}
    </span>
  );
}

const CAPABILITY_BADGES: Record<string, { label: string; style: string }> = {
  "web.search": { label: "Web", style: "border-cyan-800/40 text-cyan-400 bg-cyan-900/10" },
  "document.parse": { label: "PDF", style: "border-orange-800/40 text-orange-400 bg-orange-900/10" },
  "text.translate": { label: "Translate", style: "border-green-800/40 text-green-400 bg-green-900/10" },
  "code.audit": { label: "Security", style: "border-red-800/40 text-red-400 bg-red-900/10" },
  "defi.analyze": { label: "DeFi", style: "border-purple-800/40 text-purple-400 bg-purple-900/10" },
  "text.summarize": { label: "AI", style: "border-blue-800/40 text-blue-400 bg-blue-900/10" },
  "data.retrieve": { label: "Data", style: "border-amber-800/40 text-amber-400 bg-amber-900/10" },
};

function CapabilityBadges({ capabilities }: { capabilities: Array<{ id: string }> }) {
  const badges = capabilities
    .map((c) => CAPABILITY_BADGES[c.id])
    .filter(Boolean);

  if (badges.length === 0) return null;
  return (
    <>
      {badges.map((b, i) => (
        <span key={i} className={`font-mono text-[9px] uppercase px-1.5 py-0.5 border rounded ${b.style}`}>
          {b.label}
        </span>
      ))}
    </>
  );
}

function Stars({ rating, size = "text-xs" }: { rating: number; size?: string }) {
  return (
    <span className={`${size} text-yellow-400`}>
      {"★".repeat(Math.round(rating))}{"☆".repeat(5 - Math.round(rating))}
    </span>
  );
}

function priceRange(card: AgentCard): string {
  const prices = card.capabilities.map((c) => parseFloat(c.pricing.amount));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return `${min.toFixed(2)} USDC`;
  return `${min.toFixed(2)} — ${max.toFixed(2)} USDC`;
}

function minPrice(card: AgentCard): number {
  return Math.min(...card.capabilities.map((c) => parseFloat(c.pricing.amount)));
}

export default function MarketplacePage() {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentWithMeta[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [topAgentDids, setTopAgentDids] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterBadge, setFilterBadge] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("name");

  const loadAgents = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [agentsRes, topRes, catRes] = await Promise.all([
        fetch("/api/agent-card?list=true").then((r) => r.json()),
        fetch("/api/ratings?top=true").then((r) => r.json()).catch(() => ({ topAgents: [] })),
        fetch("/api/ratings?categories=true").then((r) => r.json()).catch(() => ({ categories: [] })),
      ]);

      const ratingMap = new Map<string, { avg: number; count: number }>();
      for (const t of topRes.topAgents ?? []) {
        ratingMap.set(t.agent_did, { avg: t.avg_rating, count: t.rating_count });
      }
      setTopAgentDids(new Set((topRes.topAgents ?? []).slice(0, 3).map((t: { agent_did: string }) => t.agent_did)));

      const enriched = (agentsRes.agents ?? []).map((a: AgentCard & { onChain?: boolean }) => ({
        ...a,
        avgRating: ratingMap.get(a.did)?.avg ?? 0,
        ratingCount: ratingMap.get(a.did)?.count ?? 0,
      }));

      setAgents(enriched);
      setCategories(catRes.categories ?? []);
    } catch {
      setLoadError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAgents(); }, [loadAgents]);

  const filtered = agents
    .filter((a) => {
      const q = search.toLowerCase();
      const matchSearch = !q || a.name.toLowerCase().includes(q) ||
        a.capabilities.some((c) => c.id.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
      const matchType = filterType === "all" || a.type === filterType;
      const matchBadge = filterBadge === "all" || a.capabilities.some((c) => c.id === filterBadge);
      return matchSearch && matchType && matchBadge;
    })
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "price-low") return minPrice(a) - minPrice(b);
      if (sort === "price-high") return minPrice(b) - minPrice(a);
      if (sort === "capabilities") return b.capabilities.length - a.capabilities.length;
      if (sort === "rating") return (b.avgRating ?? 0) - (a.avgRating ?? 0);
      return 0;
    });

  return (
    <div className="max-w-[1920px] mx-auto px-10 py-12">
      {/* Header */}
      <div className="mb-8">
        <span className="font-mono text-xs text-muted uppercase tracking-wider">Browse & Discover</span>
        <h2 className="font-display text-3xl text-mint uppercase tracking-tight mt-1">
          Agent Marketplace
        </h2>
        <p className="font-mono text-sm text-muted mt-2 max-w-2xl">
          All agents registered on Solana. Select one to view details, rate, and start a task.
        </p>
      </div>

      {/* Categories */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSearch(cat.name.split(" ")[0])}
              className="font-mono text-xs text-muted border border-forest-deep/40 px-3 py-1.5 rounded-lg hover:border-mint/20 hover:text-mint transition-all"
            >
              {cat.name}
            </button>
          ))}
          {search && (
            <button onClick={() => setSearch("")} className="font-mono text-xs text-red-400 hover:text-red-300 px-2">
              Clear
            </button>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search agents, capabilities..."
          className="flex-1 min-w-[240px] bg-forest-deep/30 border border-mint/15 rounded-lg px-4 py-2.5 font-mono text-sm text-mint placeholder:text-muted/40 focus:border-mint/30 focus:outline-none"
        />
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
          className="bg-forest-deep/30 border border-mint/15 rounded-lg px-4 py-2.5 font-mono text-sm text-muted focus:border-mint/30 focus:outline-none cursor-pointer">
          <option value="all">All Types</option>
          <option value="LLM">LLM</option>
          <option value="Task">Task</option>
          <option value="Execution">Execution</option>
        </select>
        <select value={filterBadge} onChange={(e) => setFilterBadge(e.target.value)}
          className="bg-forest-deep/30 border border-mint/15 rounded-lg px-4 py-2.5 font-mono text-sm text-muted focus:border-mint/30 focus:outline-none cursor-pointer">
          <option value="all">All Capabilities</option>
          {Object.entries(CAPABILITY_BADGES).map(([id, b]) => (
            <option key={id} value={id}>{b.label}</option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
          className="bg-forest-deep/30 border border-mint/15 rounded-lg px-4 py-2.5 font-mono text-sm text-muted focus:border-mint/30 focus:outline-none cursor-pointer">
          <option value="name">Sort: Name</option>
          <option value="rating">Sort: Rating</option>
          <option value="price-low">Sort: Price (Low)</option>
          <option value="price-high">Sort: Price (High)</option>
          <option value="capabilities">Sort: Capabilities</option>
        </select>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-6 mb-6 pb-4 border-b border-forest-deep/40">
        <span className="font-mono text-xs text-muted">
          <span className="text-mint font-display text-sm">{filtered.length}</span> agents
        </span>
        <span className="font-mono text-xs text-muted">
          <span className="text-accent font-display text-sm">{filtered.filter((a) => a.onChain).length}</span> on-chain
        </span>
        <span className="font-mono text-xs text-muted">
          <span className="text-cyan-400 font-display text-sm">{filtered.filter((a) => a.endpoint.includes("/api/hosted-agent")).length}</span> hosted
        </span>
        <span className="font-mono text-xs text-muted">
          <span className="text-blue-400 font-display text-sm">{filtered.reduce((sum, a) => sum + a.capabilities.length, 0)}</span> capabilities
        </span>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="font-mono text-sm text-muted animate-pulse">Loading agents from Solana...</span>
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <span className="font-mono text-sm text-red-400">Failed to load agents. Please check your connection.</span>
          <button onClick={loadAgents} className="font-mono text-xs text-mint border border-mint/30 px-4 py-2 rounded-lg hover:bg-mint/10 transition-colors">
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <span className="font-mono text-sm text-muted">No agents found.</span>
          <button onClick={() => router.push("/my-agents")} className="font-mono text-xs text-accent hover:text-mint transition-colors">
            Register the first one
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((agent) => (
            <button
              key={agent.did}
              onClick={() => router.push(`/agent/${encodeURIComponent(agent.did)}`)}
              className="text-left border border-mint/10 rounded-xl p-6 transition-all duration-300 hover:border-mint/30 hover:bg-forest-deep/20 hover:translate-y-[-2px] hover:shadow-lg hover:shadow-accent/5 group relative"
            >
              {/* Badges top-right */}
              <div className="absolute top-3 right-3 flex gap-1.5">
                {agent.registeredAt && (Date.now() / 1000 - agent.registeredAt) < 604800 && (
                  <span className="font-mono text-xs uppercase px-2 py-0.5 border rounded border-green-800/40 text-green-400 bg-green-900/10">
                    New
                  </span>
                )}
                {topAgentDids.has(agent.did) && (
                  <span className="font-mono text-xs uppercase px-2 py-0.5 border rounded border-yellow-800/40 text-yellow-400 bg-yellow-900/10">
                    Trending
                  </span>
                )}
              </div>

              {/* Name */}
              <div className="mb-3">
                <h3 className="font-display text-lg text-off-white uppercase tracking-wider group-hover:text-mint transition-colors truncate pr-16">
                  {agent.name}
                </h3>
                <p className="font-mono text-sm text-muted/50 mt-0.5 truncate">{agent.did}</p>
              </div>

              {/* Badges */}
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                <TypeBadge type={agent.type} />
                {agent.endpoint.includes("/api/hosted-agent") ? (
                  <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 border rounded border-cyan-800/40 text-cyan-400 bg-cyan-900/10">
                    hosted
                  </span>
                ) : agent.onChain ? (
                  <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 border rounded border-purple-800/40 text-purple-400 bg-purple-900/10">
                    on-chain
                  </span>
                ) : null}
                <CapabilityBadges capabilities={agent.capabilities} />
              </div>

              {/* Rating */}
              {agent.ratingCount! > 0 && (
                <div className="flex items-center gap-2 mb-3">
                  <Stars rating={agent.avgRating!} />
                  <span className="font-mono text-sm text-muted">
                    {agent.avgRating!.toFixed(1)} ({agent.ratingCount})
                  </span>
                </div>
              )}

              {/* Capabilities */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {agent.capabilities.map((cap) => (
                  <span key={cap.id} className="font-mono text-sm text-muted bg-forest-deep/40 px-2 py-1 rounded">
                    {cap.description}
                  </span>
                ))}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-forest-deep/40">
                <span className="font-mono text-xs text-accent">{priceRange(agent)}</span>
                <span className="font-mono text-sm text-muted group-hover:text-mint transition-colors">View Details →</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
