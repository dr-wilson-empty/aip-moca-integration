"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

/* ─── Capability color palette ─── */
const CAP_PALETTE: Record<string, { label: string; bg: string; text: string }> = {
  "web.search":      { label: "WEB",       bg: "#3b6fa0", text: "#fff" },  // steel blue
  "text.summarize":  { label: "AI",        bg: "#8b5c9e", text: "#fff" },  // muted plum
  "text.classify":   { label: "CLASSIFY",  bg: "#7b6b8a", text: "#fff" },  // dusty violet
  "text.translate":  { label: "TRANSLATE", bg: "#4a8c7f", text: "#fff" },  // sage teal
  "text.write":      { label: "WRITE",     bg: "#6b8e6b", text: "#fff" },  // fern green
  "code.audit":      { label: "SECURITY",  bg: "#a65d5d", text: "#fff" },  // brick red
  "code.review":     { label: "CODE",      bg: "#7a7a7a", text: "#fff" },  // slate grey
  "data.retrieve":   { label: "DATA",      bg: "#c08c4a", text: "#fff" },  // warm amber
  "data.analyze":    { label: "ANALYTICS", bg: "#b8913a", text: "#fff" },  // deep gold
  "defi.analyze":    { label: "DEFI",      bg: "#4a7a5e", text: "#fff" },  // forest
  "trade.execute":   { label: "TRADE",     bg: "#2e6e7a", text: "#fff" },  // dark cyan
  "document.parse":  { label: "PDF",       bg: "#c27a3a", text: "#fff" },  // burnt orange
};

const CAP_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(CAP_PALETTE).map(([k, v]) => [k, v.label])
);

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

/* ─── Dither Wave Canvas (from dalga.js) ─── */
function DitherWave({ color, alive }: { color: string; alive: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef(Math.random() * 100);
  const aliveRef = useRef(alive);
  aliveRef.current = alive;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const bayerMatrix = [
      [0, 8, 2, 10],
      [12, 4, 14, 6],
      [3, 11, 1, 9],
      [15, 7, 13, 5],
    ];

    function getThreshold(x: number, y: number) {
      return bayerMatrix[y % 4][x % 4] / 16 - 0.5;
    }

    function draw() {
      const w = parent!.clientWidth;
      const h = parent!.clientHeight;
      if (canvas!.width !== w || canvas!.height !== h) {
        canvas!.width = w;
        canvas!.height = h;
      }

      ctx!.fillStyle = DS.dark;
      ctx!.fillRect(0, 0, w, h);

      const gridSize = 5;
      const cols = Math.ceil(w / gridSize);
      const rows = Math.ceil(h / gridSize);
      const waveCenterY = rows / 2;
      const waveAmplitude = rows / 3.5;
      const frequency = 0.08;
      const speed = 0.015;

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const wave1 =
            Math.sin(x * frequency + timeRef.current) * waveAmplitude;
          const wave2 =
            Math.cos(x * frequency * 0.5 - timeRef.current) *
            (waveAmplitude * 0.5);
          const distFromWave = Math.abs(y - (waveCenterY + wave1 + wave2));
          let intensity = Math.max(0, 1 - distFromWave / 12);
          intensity += (Math.random() - 0.5) * 0.08;
          const threshold = getThreshold(x, y);
          if (intensity + threshold > 0.5) {
            ctx!.fillStyle = color;
            ctx!.fillRect(
              x * gridSize,
              y * gridSize,
              gridSize - 1,
              gridSize - 1
            );
          }
        }
      }

      if (aliveRef.current) {
        timeRef.current += speed;
        animRef.current = requestAnimationFrame(draw);
      }
    }

    draw();

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [color, alive]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
      }}
    />
  );
}

/* ─── Status Tag ─── */
function StatusTag({ label, bg }: { label: string; bg: string }) {
  return (
    <span
      className="mp-white-text"
      style={{
        fontSize: "0.7rem",
        padding: "3px 10px",
        backgroundColor: bg,
        fontFamily: DS.fontMono,
        fontWeight: 700,
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
  const capColors = agent.capabilities
    .map((c) => CAP_PALETTE[c.id])
    .filter(Boolean);
  const agentColor = capColors.length > 0 ? capColors[0].bg : config.accent;
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
      {/* Label Band — agent accent */}
      <div
        className="mp-label-band"
        style={{
          padding: "14px 20px",
          paddingLeft: 16,
          fontFamily: DS.fontPrimary,
          fontSize: "0.85rem",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          borderBottom: `1px solid ${DS.border}`,
          borderLeft: `4px solid ${agentColor}`,
          backgroundColor: `color-mix(in srgb, ${agentColor} 8%, ${DS.bg})`,
          color: DS.text,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 600, color: DS.text }}>{config.label}</span>
          {agent.onChain && <StatusTag label="ON-CHAIN" bg="#7c3aed" />}
          {isHosted && <StatusTag label="HOSTED" bg="#0e7490" />}
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
              boxShadow: statusKnown && isOnline ? `0 0 4px ${DS.green}` : "none",
            }}
          />
          <span style={{ fontSize: "0.65rem", color: DS.textMuted, marginLeft: 4 }}>
            {statusKnown ? (isOnline ? "ONLINE" : "OFFLINE") : "..."}
          </span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {isNew && (
            <span
              style={{
                fontSize: "0.65rem",
                padding: "3px 10px",
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
                fontSize: "0.65rem",
                padding: "3px 10px",
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
            fontSize: "1.05rem",
            lineHeight: 1.45,
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
          <p
            style={{
              fontSize: "0.85rem",
              color: DS.textMuted,
              marginTop: 8,
              fontStyle: "italic",
              lineHeight: 1.3,
            }}
          >
            {agent.type === "Execution"
              ? `Autonomous execution agent with ${agent.capabilities.length} on-chain ${agent.capabilities.length > 1 ? "capabilities" : "capability"}.`
              : agent.type === "LLM"
              ? `AI-powered language agent offering ${agent.capabilities.length} intelligent ${agent.capabilities.length > 1 ? "services" : "service"}.`
              : `Task-based agent providing ${agent.capabilities.length} specialized ${agent.capabilities.length > 1 ? "operations" : "operation"} on Solana.`}
          </p>
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            alignContent: "flex-start",
          }}
        >
          {capColors.map((cap, i) => (
            <span
              key={i}
              className="mp-white-text"
              style={{
                fontSize: "0.7rem",
                fontFamily: DS.fontMono,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                padding: "4px 10px",
                backgroundColor: cap.bg,
                lineHeight: 1,
              }}
            >
              {cap.label}
            </span>
          ))}
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
          }}
        >
          <DitherWave color={agentColor} alive={isOnline} />
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
              backgroundColor: agentColor,
            }}
          >
            <div>
              <span
                className="mp-white-text"
                style={{
                  fontSize: priceFontSize,
                  fontWeight: 400,
                  lineHeight: 0.9,
                  fontFamily: DS.fontPrimary,
                }}
              >
                {priceStr}
              </span>
            </div>
            <span
              className="mp-white-text"
              style={{
                fontFamily: DS.fontPrimary,
                fontSize: "0.65rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginTop: 4,
                fontWeight: 600,
                opacity: 0.85,
              }}
            >
              USDC / TASK
            </span>
          </div>
          {/* Rating + Capabilities */}
          <div
            style={{
              height: "50%",
              display: "flex",
              flexDirection: "row",
              backgroundColor: DS.white,
            }}
          >
            {/* Rating half */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                padding: 8,
                borderRight: `1px solid ${DS.border}`,
              }}
            >
              {(agent.ratingCount ?? 0) > 0 ? (
                <>
                  <div>
                    <span
                      style={{
                        fontSize: "1.8rem",
                        fontWeight: 400,
                        lineHeight: 0.9,
                        color: DS.text,
                        fontFamily: DS.fontPrimary,
                      }}
                    >
                      {agent.avgRating!.toFixed(1)}
                    </span>
                    <span style={{ fontSize: "0.8rem", marginLeft: 2, color: DS.text }}>★</span>
                  </div>
                  <span
                    style={{
                      fontFamily: DS.fontPrimary,
                      fontSize: "0.55rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginTop: 4,
                      fontWeight: 600,
                      color: DS.textMuted,
                    }}
                  >
                    {agent.ratingCount} RATINGS
                  </span>
                </>
              ) : (
                <>
                  <span style={{ fontSize: "0.7rem", color: DS.textMuted }}>★</span>
                  <span
                    style={{
                      fontFamily: DS.fontPrimary,
                      fontSize: "0.5rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginTop: 4,
                      fontWeight: 600,
                      color: DS.textMuted,
                      textAlign: "center",
                      lineHeight: 1.3,
                  }}
                >
                  BE FIRST
                  <br />
                  TO RATE
                </span>
              </>
            )}
            </div>
            {/* Capabilities half */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                padding: 8,
              }}
            >
              <span
                style={{
                  fontSize: "1.8rem",
                  fontWeight: 400,
                  lineHeight: 0.9,
                  color: DS.text,
                  fontFamily: DS.fontPrimary,
                }}
              >
                {agent.capabilities.length}
              </span>
              <span
                style={{
                  fontFamily: DS.fontPrimary,
                  fontSize: "0.55rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginTop: 4,
                  fontWeight: 600,
                  color: DS.textMuted,
                }}
              >
                {agent.capabilities.length > 1 ? "CAPABILITIES" : "CAPABILITY"}
              </span>
            </div>
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
  const [now, setNow] = useState(0);

  useEffect(() => { setNow(Date.now()); }, []);

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

      /* ── Force #000 on ALL marketplace text ── */
      main.pt-14 * { color: #000000 !important; }
      main.pt-14 input::placeholder { color: #555555 !important; }
      /* white text exceptions */
      main.pt-14 .mp-white-text { color: #ffffff !important; }

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
    fontSize: "0.7rem",
    fontWeight: 700,
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
    fontSize: "0.7rem",
    fontWeight: 700,
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
        padding: "0 0 40px",
        fontFamily: DS.fontPrimary,
        WebkitFontSmoothing: "antialiased",
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: "40px 30px",
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
                fontSize: "0.7rem",
                fontWeight: 700,
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
              fontSize: "0.7rem",
              fontWeight: 700,
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
                !!agent.registeredAt && now > 0 &&
                now / 1000 - agent.registeredAt < 604800
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
