"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { AgentCard, AgentType } from "@/types/aip";

/* ─── Types ─── */
type SortKey = "name" | "price-low" | "price-high" | "capabilities" | "rating";

interface AgentWithMeta extends AgentCard {
  onChain?: boolean;
  avgRating?: number;
  ratingCount?: number;
  registeredAt?: number;
}

interface Category {
  id: string;
  name: string;
  icon: string;
}

/* ─── Design System — exact design.js tokens ─── */
const DS = {
  bg: "#e6e5e0",
  bgHover: "#d9d8d3",
  border: "#000000",
  text: "#000000",
  textMuted: "#666666",
  dark: "#222222",
  outerBg: "#1a1a1a",
  green: "#7cb342",
  cyan: "#4dd0e1",
  yellow: "#ffee58",
  white: "#ffffff",
  error: "#c62828",
  fontPrimary: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  fontMono: '"Courier New", Courier, monospace',
};

const PATTERNS: Record<string, React.CSSProperties> = {
  cyan: {
    width: "150%",
    height: "150%",
    backgroundImage: `repeating-radial-gradient(circle at center, transparent 0, transparent 15px, ${DS.cyan} 15px, ${DS.cyan} 16px)`,
    opacity: 0.8,
  },
  green: {
    width: "150%",
    height: "150%",
    backgroundImage: `repeating-radial-gradient(circle at center, transparent 0, transparent 8px, ${DS.green} 8px, ${DS.green} 9px)`,
    opacity: 0.8,
  },
  yellow: {
    width: "150%",
    height: "150%",
    backgroundImage: `repeating-radial-gradient(circle at center, transparent 0, transparent 10px, ${DS.yellow} 10px, ${DS.yellow} 11px)`,
    opacity: 0.8,
  },
  white: {
    width: "150%",
    height: "150%",
    backgroundImage: `repeating-radial-gradient(circle at center, transparent 0, transparent 12px, ${DS.white} 12px, ${DS.white} 13px)`,
    opacity: 0.8,
  },
};

const TYPE_MAP: Record<
  AgentType,
  { pattern: string; accent: string; label: string }
> = {
  LLM: { pattern: "cyan", accent: DS.cyan, label: "LLM AGENT" },
  Task: { pattern: "green", accent: DS.green, label: "TASK AGENT" },
  Execution: { pattern: "yellow", accent: DS.yellow, label: "EXECUTION AGENT" },
};

const CAP_MAP: Record<string, string> = {
  "web.search": "WEB",
  "document.parse": "PDF",
  "text.translate": "TRANSLATE",
  "code.audit": "SECURITY",
  "defi.analyze": "DEFI",
  "text.summarize": "AI",
  "data.retrieve": "DATA",
};

/* ─── Helpers ─── */
function priceDisplay(card: AgentCard): string {
  const prices = card.capabilities.map((c) => parseFloat(c.pricing.amount));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return min.toFixed(2);
  return `${min.toFixed(2)}—${max.toFixed(2)}`;
}

function minPrice(card: AgentCard): number {
  return Math.min(
    ...card.capabilities.map((c) => parseFloat(c.pricing.amount))
  );
}

function shortDid(did: string): string {
  if (did.length > 28) return did.slice(0, 14) + "..." + did.slice(-10);
  return did;
}

/* ─── Status Tag ─── */
function StatusTag({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        fontSize: "0.55rem",
        padding: "2px 6px",
        border: `1px solid ${color}`,
        color,
        fontFamily: DS.fontMono,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        lineHeight: 1,
      }}
    >
      {label}
    </span>
  );
}

/* ─── Agent Feature Card ─── */
function AgentFeatureCard({
  agent,
  isNew,
  isTrending,
  isOnline,
  statusKnown,
  onClick,
}: {
  agent: AgentWithMeta;
  isNew: boolean;
  isTrending: boolean;
  isOnline: boolean;
  statusKnown: boolean;
  onClick: () => void;
}) {
  const config = TYPE_MAP[agent.type] || TYPE_MAP.Task;
  const capLabels = agent.capabilities
    .map((c) => CAP_MAP[c.id])
    .filter(Boolean);
  const priceStr = priceDisplay(agent);
  const priceFontSize = priceStr.includes("—") ? "1.3rem" : "2.2rem";
  const isHosted = agent.endpoint.includes("/api/hosted-agent");

  return (
    <article
      className="mp-card"
      onClick={onClick}
      style={{
        backgroundColor: DS.bg,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        cursor: "pointer",
      }}
    >
      {/* Label Band */}
      <div
        style={{
          padding: "12px 20px",
          fontFamily: DS.fontPrimary,
          fontSize: "0.75rem",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          borderBottom: `1px solid ${DS.border}`,
          color: DS.text,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 600 }}>{config.label}</span>
          {agent.onChain && <StatusTag label="ON-CHAIN" color="#7c3aed" />}
          {isHosted && <StatusTag label="HOSTED" color={DS.cyan} />}
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: statusKnown
                ? isOnline
                  ? DS.green
                  : DS.error
                : "#999",
              display: "inline-block",
            }}
          />
          <span style={{ fontSize: "0.55rem", color: DS.textMuted }}>
            {statusKnown ? (isOnline ? "ONLINE" : "OFFLINE") : "..."}
          </span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {isNew && (
            <span
              style={{
                fontSize: "0.55rem",
                padding: "2px 8px",
                backgroundColor: DS.green,
                color: DS.text,
                fontWeight: 700,
                fontFamily: DS.fontPrimary,
              }}
            >
              NEW
            </span>
          )}
          {isTrending && (
            <span
              style={{
                fontSize: "0.55rem",
                padding: "2px 8px",
                backgroundColor: DS.yellow,
                color: DS.text,
                fontWeight: 700,
                fontFamily: DS.fontPrimary,
              }}
            >
              TRENDING
            </span>
          )}
        </div>
      </div>

      {/* Title Band */}
      <div
        style={{
          padding: "25px 20px",
          borderBottom: `1px solid ${DS.border}`,
        }}
      >
        <h3
          style={{
            fontSize: "2.2rem",
            fontWeight: 400,
            lineHeight: 1.05,
            textTransform: "uppercase",
            color: DS.text,
            fontFamily: DS.fontPrimary,
          }}
        >
          {agent.name}
        </h3>
        <p
          style={{
            fontFamily: DS.fontMono,
            fontSize: "0.55rem",
            color: DS.textMuted,
            marginTop: 8,
            letterSpacing: "0.05em",
          }}
        >
          {shortDid(agent.did)}
        </p>
      </div>

      {/* Content Band */}
      <div
        className="mp-content-band"
        style={{
          padding: 20,
          borderBottom: `1px solid ${DS.border}`,
          display: "grid",
          gridTemplateColumns: "3fr 2fr",
          gap: 20,
          flexGrow: 1,
        }}
      >
        <div
          style={{
            fontSize: "0.85rem",
            lineHeight: 1.4,
            color: DS.text,
            fontFamily: DS.fontPrimary,
          }}
        >
          {agent.capabilities.map((cap, i) => (
            <span key={cap.id}>
              {cap.description}
              {i < agent.capabilities.length - 1 ? ". " : "."}
            </span>
          ))}
        </div>
        <div
          style={{
            fontSize: "0.75rem",
            lineHeight: 1.3,
            textTransform: "uppercase",
            fontWeight: 600,
            color: DS.text,
            fontFamily: DS.fontPrimary,
          }}
        >
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {capLabels.map((label, i) => (
              <li
                key={i}
                style={{
                  position: "relative",
                  paddingLeft: 10,
                  marginBottom: 4,
                }}
              >
                <span style={{ position: "absolute", left: 0 }}>•</span>
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Footer Band */}
      <div style={{ display: "flex", height: 160 }}>
        <div
          style={{
            width: "50%",
            borderRight: `1px solid ${DS.border}`,
            backgroundColor: DS.dark,
            position: "relative",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={PATTERNS[config.pattern] || PATTERNS.white} />
        </div>
        <div
          style={{ width: "50%", display: "flex", flexDirection: "column" }}
        >
          {/* Price */}
          <div
            style={{
              height: "50%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              padding: 10,
              borderBottom: `1px solid ${DS.border}`,
              backgroundColor: config.accent,
            }}
          >
            <div>
              <span
                style={{
                  fontSize: priceFontSize,
                  fontWeight: 400,
                  lineHeight: 0.9,
                  color: DS.text,
                  fontFamily: DS.fontPrimary,
                }}
              >
                {priceStr}
              </span>
            </div>
            <span
              style={{
                fontFamily: DS.fontPrimary,
                fontSize: "0.65rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginTop: 4,
                fontWeight: 600,
                color: DS.text,
              }}
            >
              USDC
            </span>
          </div>
          {/* Rating / Capabilities */}
          <div
            style={{
              height: "50%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              padding: 10,
              backgroundColor: DS.white,
            }}
          >
            {(agent.ratingCount ?? 0) > 0 ? (
              <>
                <div>
                  <span
                    style={{
                      fontSize: "2.8rem",
                      fontWeight: 400,
                      lineHeight: 0.9,
                      color: DS.text,
                      fontFamily: DS.fontPrimary,
                    }}
                  >
                    {agent.avgRating!.toFixed(1)}
                  </span>
                  <span
                    style={{
                      fontSize: "1rem",
                      verticalAlign: "super",
                      marginLeft: 2,
                      color: DS.text,
                    }}
                  >
                    ★
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: DS.fontPrimary,
                    fontSize: "0.65rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginTop: 4,
                    fontWeight: 600,
                    color: DS.text,
                  }}
                >
                  {agent.ratingCount} RATINGS
                </span>
              </>
            ) : (
              <>
                <span
                  style={{
                    fontFamily: DS.fontPrimary,
                    fontSize: "2.8rem",
                    fontWeight: 400,
                    lineHeight: 0.9,
                    color: DS.text,
                  }}
                >
                  {agent.capabilities.length}
                </span>
                <span
                  style={{
                    fontFamily: DS.fontPrimary,
                    fontSize: "0.65rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginTop: 4,
                    fontWeight: 600,
                    color: DS.text,
                  }}
                >
                  CAPABILITIES
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

/* ─── Main Page ─── */
export default function MarketplacePage() {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentWithMeta[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [topAgentDids, setTopAgentDids] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [agentStatus, setAgentStatus] = useState<Map<string, boolean>>(
    new Map()
  );
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterBadge, setFilterBadge] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("name");

  /* Override page + nav to match design.js theme */
  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-mp-theme", "true");
    style.textContent = `
      /* ── Full page override ── */
      body { background-color: ${DS.bg} !important; color: ${DS.text} !important; }
      main.pt-14 { padding-top: 56px; }

      /* ── Navbar override ── */
      nav[aria-label="Main navigation"] {
        background-color: ${DS.bg} !important;
        border-bottom: 1px solid ${DS.border} !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }
      nav[aria-label="Main navigation"] a,
      nav[aria-label="Main navigation"] span {
        color: ${DS.text} !important;
        font-family: ${DS.fontMono} !important;
      }
      nav[aria-label="Main navigation"] a:hover {
        color: ${DS.textMuted} !important;
      }
      nav[aria-label="Main navigation"] a[aria-current="page"] {
        color: ${DS.text} !important;
        font-weight: 700 !important;
      }
      nav[aria-label="Main navigation"] .bg-accent,
      nav[aria-label="Main navigation"] .bg-mint\\/10,
      nav[aria-label="Main navigation"] .w-2.h-2 {
        background-color: ${DS.green} !important;
      }
      nav[aria-label="Main navigation"] .w-px {
        background-color: ${DS.border} !important;
        opacity: 0.2;
      }

      /* ── Card hover ── */
      .mp-card { transition: background-color 0.15s ease; }
      .mp-card:hover { background-color: ${DS.bgHover} !important; }
      .mp-btn { transition: background-color 0.15s ease; }
      .mp-btn:hover { background-color: ${DS.bgHover} !important; }
      .mp-cat-btn { transition: background-color 0.15s ease; }
      .mp-cat-btn:hover { background-color: ${DS.bgHover} !important; }
      .mp-loading-pulse { animation: mp-pulse 2s cubic-bezier(0.4,0,0.6,1) infinite; }
      @keyframes mp-pulse { 0%,100%{opacity:0.4} 50%{opacity:1} }

      /* ── Responsive ── */
      @media (max-width: 900px) {
        .mp-grid { grid-template-columns: 1fr !important; }
        .mp-content-band { grid-template-columns: 1fr !important; }
        .mp-structural-band { flex-direction: column !important; }
        .mp-structural-band > div { border-right: none !important; border-bottom: 1px solid ${DS.border} !important; }
        .mp-stats-band { flex-wrap: wrap !important; }
        .mp-stats-band > div { flex: 1 1 45% !important; }
        .mp-module-title { font-size: 2.5rem !important; }
        .mp-cat-band { display: none !important; }
      }
      @media (max-width: 600px) {
        .mp-module-title { font-size: 2rem !important; }
        .mp-stats-band > div { flex: 1 1 100% !important; }
      }

      /* ── Force black text on all marketplace content ── */
      main.pt-14 * { color: ${DS.text}; }
      main.pt-14 select, main.pt-14 option { color: ${DS.text} !important; background-color: ${DS.bg} !important; }
      main.pt-14 input { color: ${DS.text} !important; }
      main.pt-14 input::placeholder { color: ${DS.textMuted} !important; }
      main.pt-14 button { color: ${DS.text} !important; }

      /* ── Scrollbar for this page ── */
      ::-webkit-scrollbar-track { background: ${DS.bg} !important; }
      ::-webkit-scrollbar-thumb { background: ${DS.textMuted} !important; }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  /* Data fetching */
  const loadAgents = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [agentsRes, topRes, catRes] = await Promise.all([
        fetch("/api/agent-card?list=true").then((r) => r.json()),
        fetch("/api/ratings?top=true")
          .then((r) => r.json())
          .catch(() => ({ topAgents: [] })),
        fetch("/api/ratings?categories=true")
          .then((r) => r.json())
          .catch(() => ({ categories: [] })),
      ]);

      const ratingMap = new Map<string, { avg: number; count: number }>();
      for (const t of topRes.topAgents ?? []) {
        ratingMap.set(t.agent_did, {
          avg: t.avg_rating,
          count: t.rating_count,
        });
      }
      setTopAgentDids(
        new Set(
          (topRes.topAgents ?? [])
            .slice(0, 3)
            .map((t: { agent_did: string }) => t.agent_did)
        )
      );

      const enriched = (agentsRes.agents ?? []).map(
        (a: AgentCard & { onChain?: boolean }) => ({
          ...a,
          avgRating: ratingMap.get(a.did)?.avg ?? 0,
          ratingCount: ratingMap.get(a.did)?.count ?? 0,
        })
      );

      setAgents(enriched);
      setCategories(catRes.categories ?? []);

      fetch("/api/agent-card/status")
        .then((r) => r.json())
        .then((d) => {
          const statusMap = new Map<string, boolean>();
          for (const a of d.agents ?? []) statusMap.set(a.did, a.online);
          setAgentStatus(statusMap);
        })
        .catch(() => {});
    } catch {
      setLoadError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  /* Filtering & Sorting */
  const filtered = agents
    .filter((a) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        a.name.toLowerCase().includes(q) ||
        a.capabilities.some(
          (c) =>
            c.id.toLowerCase().includes(q) ||
            c.description.toLowerCase().includes(q)
        );
      const matchType = filterType === "all" || a.type === filterType;
      const matchBadge =
        filterBadge === "all" ||
        a.capabilities.some((c) => c.id === filterBadge);
      return matchSearch && matchType && matchBadge;
    })
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "price-low") return minPrice(a) - minPrice(b);
      if (sort === "price-high") return minPrice(b) - minPrice(a);
      if (sort === "capabilities")
        return b.capabilities.length - a.capabilities.length;
      if (sort === "rating") return (b.avgRating ?? 0) - (a.avgRating ?? 0);
      return 0;
    });

  /* Shared styles */
  const bandItem: React.CSSProperties = {
    flex: 1,
    padding: "10px 30px",
    fontFamily: DS.fontMono,
    fontSize: "0.65rem",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    borderRight: `1px solid ${DS.border}`,
    color: DS.text,
    display: "flex",
    alignItems: "center",
  };

  const selectStyle: React.CSSProperties = {
    width: "100%",
    fontFamily: DS.fontMono,
    fontSize: "0.65rem",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    backgroundColor: "transparent",
    border: "none",
    outline: "none",
    color: DS.text,
    cursor: "pointer",
    appearance: "none",
    WebkitAppearance: "none",
  };

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1920,
        margin: "0 auto",
        padding: "0 40px 40px",
        fontFamily: DS.fontPrimary,
        WebkitFontSmoothing: "antialiased",
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: "40px 0",
          borderBottom: `1px solid ${DS.border}`,
        }}
      >
        <h2
          className="mp-module-title"
          style={{
            fontSize: "4rem",
            fontWeight: 400,
            lineHeight: 0.95,
            textTransform: "uppercase",
            letterSpacing: "-0.02em",
            maxWidth: 800,
            color: DS.text,
            fontFamily: DS.fontPrimary,
          }}
        >
          Agent
          <br />
          Marketplace
        </h2>
        <p
          style={{
            fontFamily: DS.fontMono,
            fontSize: "0.7rem",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: DS.textMuted,
            marginTop: 16,
          }}
        >
          All agents registered on Solana / Select to view details, rate, and
          start a task
        </p>
      </header>

      {/* Categories Band */}
      {categories.length > 0 && (
        <div
          className="mp-cat-band"
          style={{
            display: "flex",
            borderBottom: `1px solid ${DS.border}`,
            flexWrap: "wrap",
          }}
        >
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSearch(cat.name.split(" ")[0])}
              className="mp-cat-btn"
              style={{
                flex: "1 1 auto",
                padding: "10px 20px",
                fontFamily: DS.fontMono,
                fontSize: "0.65rem",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                backgroundColor: "transparent",
                color: DS.text,
                cursor: "pointer",
                borderTop: "none",
                borderBottom: "none",
                borderLeft: "none",
                borderRight: `1px solid ${DS.border}`,
              }}
            >
              {cat.name}
            </button>
          ))}
          {search && (
            <button
              onClick={() => setSearch("")}
              className="mp-cat-btn"
              style={{
                padding: "10px 20px",
                fontFamily: DS.fontMono,
                fontSize: "0.65rem",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                backgroundColor: "transparent",
                color: DS.error,
                cursor: "pointer",
                border: "none",
              }}
            >
              CLEAR
            </button>
          )}
        </div>
      )}

      {/* Structural Band — Filters */}
      <div
        className="mp-structural-band"
        style={{
          display: "flex",
          borderBottom: `1px solid ${DS.border}`,
          backgroundColor: DS.bg,
        }}
      >
        <div style={{ ...bandItem, flex: 2 }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="SEARCH AGENTS..."
            style={{
              width: "100%",
              fontFamily: DS.fontMono,
              fontSize: "0.65rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              backgroundColor: "transparent",
              border: "none",
              outline: "none",
              color: DS.text,
            }}
          />
        </div>
        <div style={bandItem}>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={selectStyle}
          >
            <option value="all">TYPE</option>
            <option value="LLM">LLM</option>
            <option value="Task">TASK</option>
            <option value="Execution">EXECUTION</option>
          </select>
        </div>
        <div style={bandItem}>
          <select
            value={filterBadge}
            onChange={(e) => setFilterBadge(e.target.value)}
            style={selectStyle}
          >
            <option value="all">CAPABILITY</option>
            {Object.entries(CAP_MAP).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ ...bandItem, borderRight: "none" }}>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            style={selectStyle}
          >
            <option value="name">SORT: NAME</option>
            <option value="rating">SORT: RATING</option>
            <option value="price-low">SORT: PRICE LOW</option>
            <option value="price-high">SORT: PRICE HIGH</option>
            <option value="capabilities">SORT: CAPS</option>
          </select>
        </div>
      </div>

      {/* Stats Band */}
      <div
        className="mp-stats-band"
        style={{
          display: "flex",
          borderBottom: `1px solid ${DS.border}`,
        }}
      >
        <div style={bandItem}>
          <span
            style={{
              fontSize: "1.2rem",
              fontWeight: 400,
              marginRight: 6,
              fontFamily: DS.fontPrimary,
            }}
          >
            {filtered.length}
          </span>{" "}
          AGENTS
        </div>
        <div style={bandItem}>
          <span
            style={{
              fontSize: "1.2rem",
              fontWeight: 400,
              marginRight: 6,
              fontFamily: DS.fontPrimary,
            }}
          >
            {filtered.filter((a) => a.onChain).length}
          </span>{" "}
          ON-CHAIN
        </div>
        <div style={bandItem}>
          <span
            style={{
              fontSize: "1.2rem",
              fontWeight: 400,
              marginRight: 6,
              fontFamily: DS.fontPrimary,
            }}
          >
            {
              filtered.filter((a) =>
                a.endpoint.includes("/api/hosted-agent")
              ).length
            }
          </span>{" "}
          HOSTED
        </div>
        <div style={{ ...bandItem, borderRight: "none" }}>
          <span
            style={{
              fontSize: "1.2rem",
              fontWeight: 400,
              marginRight: 6,
              fontFamily: DS.fontPrimary,
            }}
          >
            {filtered.reduce((sum, a) => sum + a.capabilities.length, 0)}
          </span>{" "}
          CAPABILITIES
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding: "100px 30px", textAlign: "center" }}>
          <p
            className="mp-loading-pulse"
            style={{
              fontFamily: DS.fontMono,
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: DS.textMuted,
            }}
          >
            Loading agents from Solana...
          </p>
        </div>
      ) : loadError ? (
        <div style={{ padding: "100px 30px", textAlign: "center" }}>
          <p
            style={{
              fontFamily: DS.fontMono,
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: DS.error,
              marginBottom: 20,
            }}
          >
            Failed to load agents. Please check your connection.
          </p>
          <button
            onClick={loadAgents}
            className="mp-btn"
            style={{
              padding: "10px 30px",
              fontFamily: DS.fontMono,
              fontSize: "0.65rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              backgroundColor: "transparent",
              border: `1px solid ${DS.border}`,
              cursor: "pointer",
              color: DS.text,
            }}
          >
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: "100px 30px", textAlign: "center" }}>
          <p
            style={{
              fontFamily: DS.fontMono,
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: DS.textMuted,
              marginBottom: 20,
            }}
          >
            No agents found
          </p>
          <button
            onClick={() => router.push("/my-agents")}
            className="mp-btn"
            style={{
              padding: "10px 30px",
              fontFamily: DS.fontMono,
              fontSize: "0.65rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              backgroundColor: "transparent",
              border: `1px solid ${DS.border}`,
              cursor: "pointer",
              color: DS.text,
            }}
          >
            Register the first one
          </button>
        </div>
      ) : (
        <section
          className="mp-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            backgroundColor: DS.border,
            gap: "1px",
          }}
        >
          {filtered.map((agent) => (
            <AgentFeatureCard
              key={agent.did}
              agent={agent}
              isNew={
                !!agent.registeredAt &&
                Date.now() / 1000 - agent.registeredAt < 604800
              }
              isTrending={topAgentDids.has(agent.did)}
              isOnline={agentStatus.get(agent.did) === true}
              statusKnown={agentStatus.has(agent.did)}
              onClick={() =>
                router.push(`/agent/${encodeURIComponent(agent.did)}`)
              }
            />
          ))}
        </section>
      )}
    </div>
  );
}
