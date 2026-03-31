"use client";

import { useState } from "react";
import type { Artifact } from "@/types/aip";

const SOLANA_EXPLORER = "https://explorer.solana.com/tx";

/**
 * Parse raw artifact string into structured Artifact.
 * Supports:
 * - JSON with { type, ... } structure
 * - Plain text / markdown (auto-detected)
 */
export function parseArtifact(raw: string): Artifact {
  // Try JSON parse first
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.type) {
      return parsed as Artifact;
    }
    // Valid JSON but not artifact format → json type
    return { type: "json", data: parsed };
  } catch {
    // Not JSON — treat as text/markdown
    return { type: "text", content: raw };
  }
}

/** Render artifact based on type */
export default function ArtifactRenderer({ artifact, compact }: { artifact: Artifact; compact?: boolean }) {
  switch (artifact.type) {
    case "text":
      return <TextArtifact content={artifact.content || ""} compact={compact} />;
    case "json":
      return <JsonArtifact data={artifact.data} compact={compact} />;
    case "image":
      return <ImageArtifact url={artifact.url || ""} alt={artifact.alt} />;
    case "link":
      return <LinkArtifact url={artifact.url || ""} label={artifact.label} />;
    case "transaction":
      return <TransactionArtifact txHash={artifact.txHash || ""} label={artifact.label} />;
    case "file":
      return <FileArtifact url={artifact.url || ""} label={artifact.label} />;
    default:
      return <TextArtifact content={String(artifact.content || "")} compact={compact} />;
  }
}

/* ------------------------------------------------------------------ */
/*  Type-specific renderers                                            */
/* ------------------------------------------------------------------ */

function TextArtifact({ content, compact }: { content: string; compact?: boolean }) {
  // Simple markdown-like rendering: headings, bold, code blocks, lists
  const lines = content.split("\n");

  return (
    <div className={`font-mono text-xs text-off-white leading-relaxed ${compact ? "max-h-32 overflow-hidden" : ""}`}>
      {lines.map((line, i) => {
        // Headings
        if (line.startsWith("### ")) return <h4 key={i} className="font-display text-sm text-mint uppercase tracking-wider mt-3 mb-1">{line.slice(4)}</h4>;
        if (line.startsWith("## ")) return <h3 key={i} className="font-display text-base text-mint uppercase tracking-wider mt-4 mb-1">{line.slice(3)}</h3>;
        if (line.startsWith("# ")) return <h2 key={i} className="font-display text-lg text-mint uppercase tracking-wider mt-4 mb-2">{line.slice(2)}</h2>;

        // Code blocks
        if (line.startsWith("```")) return <div key={i} className="border-t border-forest-deep/40 my-1" />;

        // Horizontal rule
        if (line.startsWith("---")) return <hr key={i} className="border-forest-deep/40 my-3" />;

        // List items
        if (line.startsWith("- ") || line.startsWith("* ")) return (
          <div key={i} className="flex gap-2 pl-2">
            <span className="text-accent shrink-0">•</span>
            <span>{renderInline(line.slice(2))}</span>
          </div>
        );

        // Numbered lists
        if (/^\d+\.\s/.test(line)) return (
          <div key={i} className="flex gap-2 pl-2">
            <span className="text-accent shrink-0">{line.match(/^\d+/)?.[0]}.</span>
            <span>{renderInline(line.replace(/^\d+\.\s/, ""))}</span>
          </div>
        );

        // Empty line
        if (line.trim() === "") return <div key={i} className="h-2" />;

        // Regular paragraph
        return <p key={i}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

/** Inline formatting: **bold**, `code`, [links] */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="text-mint">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} className="bg-forest-deep/40 px-1 py-0.5 rounded text-accent">{part.slice(1, -1)}</code>;
    }
    return <span key={i}>{part}</span>;
  });
}

function JsonArtifact({ data, compact }: { data: unknown; compact?: boolean }) {
  const [expanded, setExpanded] = useState(!compact);
  const jsonStr = JSON.stringify(data, null, 2);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[10px] text-purple-400 uppercase">JSON Data</span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="font-mono text-[10px] text-muted hover:text-mint transition-colors"
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>
      <pre className={`font-mono text-[11px] text-body bg-bg-base/50 border border-mint/10 p-3 rounded-lg overflow-x-auto ${expanded ? "max-h-[400px]" : "max-h-24"} overflow-y-auto transition-all`}>
        {jsonStr}
      </pre>
    </div>
  );
}

function ImageArtifact({ url, alt }: { url: string; alt?: string }) {
  const [error, setError] = useState(false);

  if (error || !url) {
    return (
      <div className="border border-forest-deep/40 rounded-lg p-8 flex items-center justify-center">
        <span className="font-mono text-xs text-muted">Image failed to load</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <img
        src={url}
        alt={alt || "Agent generated image"}
        onError={() => setError(true)}
        className="max-w-full rounded-lg border border-mint/10"
      />
      {alt && <span className="font-mono text-[10px] text-muted">{alt}</span>}
      <a href={url} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] text-mint hover:text-accent">
        Open full size ↗
      </a>
    </div>
  );
}

function LinkArtifact({ url, label }: { url: string; label?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-4 border border-mint/20 rounded-lg hover:border-mint/40 hover:bg-forest-deep/20 transition-all group"
    >
      <span className="font-mono text-lg text-mint">↗</span>
      <div className="flex-1 min-w-0">
        <span className="font-mono text-sm text-off-white group-hover:text-mint transition-colors block truncate">
          {label || url}
        </span>
        {label && <span className="font-mono text-[10px] text-muted truncate block">{url}</span>}
      </div>
    </a>
  );
}

function TransactionArtifact({ txHash, label }: { txHash: string; label?: string }) {
  return (
    <a
      href={`${SOLANA_EXPLORER}/${txHash}?cluster=devnet`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-4 border border-accent/20 rounded-lg bg-accent/5 hover:border-accent/40 transition-all group"
    >
      <span className="font-mono text-lg text-accent">◎</span>
      <div className="flex-1 min-w-0">
        <span className="font-mono text-xs text-accent block">{label || "View Transaction"}</span>
        <span className="font-mono text-[10px] text-muted break-all">{txHash}</span>
      </div>
      <span className="font-mono text-xs text-muted group-hover:text-accent">↗</span>
    </a>
  );
}

function FileArtifact({ url, label }: { url: string; label?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      download
      className="flex items-center gap-3 p-4 border border-blue-800/30 rounded-lg bg-blue-900/5 hover:border-blue-600/40 transition-all group"
    >
      <span className="font-mono text-lg text-blue-400">↓</span>
      <div className="flex-1 min-w-0">
        <span className="font-mono text-sm text-off-white group-hover:text-blue-400 transition-colors block">
          {label || "Download File"}
        </span>
        <span className="font-mono text-[10px] text-muted truncate block">{url}</span>
      </div>
    </a>
  );
}
