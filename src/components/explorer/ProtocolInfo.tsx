"use client";

import { useState } from "react";
import MonoLabel from "@/components/ui/MonoLabel";

const LAYERS = [
  {
    id: "agent",
    label: "Agent Layer",
    desc: "LLM, Task & Execution agents",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
  },
  {
    id: "protocol",
    label: "Protocol Layer",
    desc: "Handshake, task marketplace, payment routing",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" />
        <line x1="12" y1="3" x2="12" y2="21" />
        <line x1="3" y1="12" x2="21" y2="12" />
      </svg>
    ),
  },
  {
    id: "blockchain",
    label: "Blockchain Layer",
    desc: "DID, escrow, smart contracts, Solana",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 12h16" />
        <path d="M12 4v16" />
      </svg>
    ),
  },
  {
    id: "compute",
    label: "Compute Layer",
    desc: "GPU access, inference routing, hosting",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polyline points="4 14 10 14 10 20" />
        <polyline points="20 10 14 10 14 4" />
        <line x1="14" y1="10" x2="21" y2="3" />
        <line x1="3" y1="21" x2="10" y2="14" />
      </svg>
    ),
  },
];

const PROTOCOLS = [
  { name: "MCP", role: "Agent-to-tool communication", by: "Anthropic" },
  { name: "A2A", role: "Task handshake specification", by: "Google / Linux Foundation" },
  { name: "x402", role: "Payment rail (Solana settlement)", by: "Coinbase" },
  { name: "W3C DID", role: "Agent identity standard", by: "W3C" },
];

export default function ProtocolInfo() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-forest-deep/40 bg-forest-deep/10 rounded-xl">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-forest-deep/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-accent text-xs">⬡</span>
          <MonoLabel className="!mb-0 text-accent">Protocol Architecture & Relations</MonoLabel>
        </div>
        <span className={`text-muted text-xs transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>

      {expanded && (
        <div className="px-6 pb-6 flex flex-col gap-6 border-t border-forest-deep/40">
          {/* 4-Layer Architecture */}
          <div className="pt-4">
            <MonoLabel className="mb-3">AIP Architecture — 4 Layers</MonoLabel>
            <div className="grid grid-cols-4 gap-3">
              {LAYERS.map((layer, i) => (
                <div key={layer.id} className="flex flex-col items-center gap-2">
                  <div className="border border-forest-deep/60 bg-forest-deep/20 w-full p-4 rounded-lg flex flex-col items-center gap-2 hover:border-accent/30 transition-colors">
                    <span className="text-accent">{layer.icon}</span>
                    <span className="font-mono text-[10px] text-off-white uppercase text-center">
                      {layer.label}
                    </span>
                    <span className="font-mono text-[8px] text-muted text-center leading-relaxed">
                      {layer.desc}
                    </span>
                  </div>
                  {i < LAYERS.length - 1 && (
                    <span className="text-forest-mid text-[8px] hidden">→</span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1 mt-2">
              {LAYERS.map((_, i) => (
                <div key={i} className="flex items-center flex-1">
                  <div className="w-full h-px bg-accent/20" />
                  {i < LAYERS.length - 1 && (
                    <span className="text-accent/40 text-[8px] px-1">→</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Protocol Relations */}
          <div>
            <MonoLabel className="mb-3">Composed Protocols</MonoLabel>
            <p className="font-mono text-[10px] text-body mb-3 leading-relaxed">
              AIP does not replace existing protocols — it composes them.
            </p>
            <div className="flex flex-col gap-1">
              {PROTOCOLS.map((p) => (
                <div
                  key={p.name}
                  className="grid grid-cols-[80px_1fr_120px] gap-4 py-2 px-3 border-b border-forest-deep/30 hover:bg-forest-deep/20 transition-colors items-center"
                >
                  <span className="font-mono text-[11px] text-accent uppercase">
                    {p.name}
                  </span>
                  <span className="font-mono text-[10px] text-body">
                    {p.role}
                  </span>
                  <span className="font-mono text-[9px] text-muted text-right">
                    {p.by}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Key distinction */}
          <div className="border border-forest-deep/40 p-4 rounded-lg bg-forest-deep/20">
            <MonoLabel className="mb-2">MCP vs A2A</MonoLabel>
            <p className="font-mono text-[10px] text-body leading-relaxed">
              MCP connects agents to <span className="text-off-white">tools</span> with structured I/O.
              A2A connects agents to <span className="text-off-white">agents</span> where either party can reason and negotiate.
              AIP sits at the A2A layer and adds the <span className="text-accent">payment primitive</span> that A2A does not specify.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
