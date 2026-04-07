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
  // Strip markdown code block wrappers if present
  let cleaned = raw.trim();
  const codeBlockMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (codeBlockMatch) cleaned = codeBlockMatch[1].trim();

  // Try JSON parse
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object") {
      // Has explicit type field → use as-is
      if (parsed.type && typeof parsed.type === "string") {
        // If type is "json" and has data field, render as json
        if (parsed.type === "json" && parsed.data) {
          return { type: "json", data: parsed.data };
        }
        return parsed as Artifact;
      }
      // No type field → json type
      return { type: "json", data: parsed };
    }
  } catch {
    // Maybe JSON is embedded in text — try to extract
    const jsonMatch = cleaned.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed && typeof parsed === "object") {
          if (parsed.type === "json" && parsed.data) {
            return { type: "json", data: parsed.data };
          }
          return { type: "json", data: parsed };
        }
      } catch { /* not valid JSON */ }
    }
  }

  // Not JSON — treat as text/markdown
  return { type: "text", content: raw };
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

function DownloadButton({ content, filename }: { content: string; filename: string }) {
  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button onClick={handleDownload} className="font-mono text-[9px] text-muted hover:text-accent border border-forest-deep/40 px-2 py-0.5 rounded transition-colors">
      Download {filename.split(".").pop()?.toUpperCase()}
    </button>
  );
}

function TextArtifact({ content, compact }: { content: string; compact?: boolean }) {
  const lines = content.split("\n");
  const showDownload = content.length > 500;

  return (
    <div className={`font-mono text-xs text-off-white leading-relaxed ${compact ? "max-h-32 overflow-hidden" : ""}`}>
      {showDownload && !compact && (
        <div className="flex justify-end mb-2">
          <DownloadButton content={content} filename="output.txt" />
        </div>
      )}
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

/** Inline formatting: **bold**, `code`, [links](url) */
function renderInline(text: string): React.ReactNode {
  // First pass: extract markdown links [text](url)
  const withLinks = text.split(/(\[.*?\]\(.*?\))/g);
  return withLinks.map((segment, si) => {
    // Check for markdown link
    const linkMatch = segment.match(/^\[(.*?)\]\((.*?)\)$/);
    if (linkMatch) {
      return (
        <a key={si} href={linkMatch[2]} target="_blank" rel="noopener noreferrer"
          className="text-accent hover:text-mint underline underline-offset-2 transition-colors">
          {linkMatch[1]}
        </a>
      );
    }

    // Second pass: bold and code
    const parts = segment.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={`${si}_${i}`} className="text-mint">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={`${si}_${i}`} className="bg-forest-deep/40 px-1 py-0.5 rounded text-accent">{part.slice(1, -1)}</code>;
      }

      // Check for bare URLs (https://...)
      const urlParts = part.split(/(https?:\/\/[^\s)]+)/g);
      if (urlParts.length > 1) {
        return urlParts.map((up, ui) => {
          if (up.match(/^https?:\/\//)) {
            return (
              <a key={`${si}_${i}_${ui}`} href={up} target="_blank" rel="noopener noreferrer"
                className="text-accent hover:text-mint underline underline-offset-2 transition-colors break-all">
                {up.length > 50 ? up.slice(0, 47) + "..." : up}
              </a>
            );
          }
          return <span key={`${si}_${i}_${ui}`}>{up}</span>;
        });
      }

      return <span key={`${si}_${i}`}>{part}</span>;
    });
  });
}

function JsonArtifact({ data, compact }: { data: unknown; compact?: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const jsonStr = JSON.stringify(data, null, 2);

  // Try to render structured data nicely
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    const title = obj.title as string | undefined;
    const summary = obj.summary as string | undefined;
    const metrics = obj.metrics as Array<{ label: string; value: string }> | undefined;

    if (title || metrics) {
      return (
        <div className={compact ? "max-h-48 overflow-y-auto" : ""}>
          {title && <h3 className="font-display text-sm text-mint uppercase tracking-wider mb-2">{title}</h3>}
          {metrics && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              {metrics.map((m, i) => (
                <div key={i} className="border border-forest-deep/40 rounded p-2">
                  <span className="font-mono text-[9px] text-muted uppercase block">{m.label}</span>
                  <span className="font-mono text-xs text-accent">{m.value}</span>
                </div>
              ))}
            </div>
          )}
          {summary && <p className="font-mono text-xs text-body leading-relaxed">{summary}</p>}
        </div>
      );
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[10px] text-purple-400 uppercase">JSON Data</span>
        <div className="flex gap-2">
          <DownloadButton content={jsonStr} filename="output.json" />
          <button
            onClick={() => setExpanded(!expanded)}
            className="font-mono text-[10px] text-muted hover:text-mint transition-colors"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>
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
