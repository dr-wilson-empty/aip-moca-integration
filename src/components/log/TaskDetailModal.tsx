"use client";

import type { Task } from "@/types/aip";
import ArtifactRenderer, { parseArtifact } from "@/components/ui/ArtifactRenderer";

const SOLANA_EXPLORER = "https://explorer.solana.com/tx";

const DS = {
  bg: "#e6e5e0",
  border: "#000000",
  text: "#000000",
  textMuted: "#666666",
  green: "#7cb342",
  error: "#c62828",
  cyan: "#4dd0e1",
  purple: "#7c3aed",
  fontPrimary: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  fontMono: '"Courier New", Courier, monospace',
};

export default function TaskDetailModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const bandLabel: React.CSSProperties = { fontFamily: DS.fontMono, fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)", padding: 16 }} onClick={onClose}>
      <div style={{ width: "100%", maxWidth: 700, border: `1px solid ${DS.border}`, backgroundColor: DS.bg, display: "flex", flexDirection: "column", maxHeight: "80vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: "16px 24px", borderBottom: `1px solid ${DS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#d5d0c8" }}>
          <div>
            <span style={{ ...bandLabel, fontSize: "0.7rem", color: DS.textMuted, display: "block", marginBottom: 4 }}>TASK DETAIL</span>
            <span style={{ fontFamily: DS.fontPrimary, fontSize: "1.2rem", fontWeight: 400, textTransform: "uppercase" }}>{task.id}</span>
          </div>
          <button onClick={onClose} style={{ ...bandLabel, fontSize: "1rem", background: "none", border: "none", cursor: "pointer" }}>X</button>
        </div>

        {/* Meta grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: `1px solid ${DS.border}` }}>
          {[
            { label: "AGENT", value: task.counterpartAgent },
            { label: "CAPABILITY", value: task.capability },
            { label: "INPUT", value: task.input },
            { label: "USDC SPENT", value: `${task.usdcSpent} USDC` },
            ...(task.isAgentTask ? [{ label: "SOURCE", value: "AGENT TASK (AUTONOMOUS)" }] : []),
            ...(task.chainId ? [{ label: "CHAIN", value: task.chainId }] : []),
          ].map((item, i) => (
            <div key={i} style={{ padding: "12px 24px", borderBottom: "1px solid #ccc", borderRight: i % 2 === 0 ? `1px solid ${DS.border}` : "none" }}>
              <span style={{ ...bandLabel, fontSize: "0.65rem", color: DS.textMuted, display: "block", marginBottom: 4 }}>{item.label}</span>
              <span style={{ fontFamily: DS.fontMono, fontSize: "0.85rem", fontWeight: 700, wordBreak: "break-all" }}>{item.value}</span>
            </div>
          ))}
        </div>

        {/* Artifact */}
        {task.artifact && (
          <div style={{ padding: "16px 24px", borderBottom: `1px solid ${DS.border}`, borderLeft: `4px solid ${DS.green}` }}>
            <span className="ds-accent-text" style={{ ...bandLabel, fontSize: "0.7rem", display: "block", marginBottom: 8 }}>ARTIFACT</span>
            <div style={{ fontSize: "0.95rem", lineHeight: 1.6 }}>
              <ArtifactRenderer artifact={parseArtifact(task.artifact)} />
            </div>
          </div>
        )}

        {/* Tx links */}
        {(task.escrowTxHash || task.settlementTxHash) && (
          <div style={{ padding: "12px 24px", borderBottom: `1px solid ${DS.border}`, display: "flex", flexDirection: "column", gap: 4 }}>
            {task.escrowTxHash && (
              <a href={`${SOLANA_EXPLORER}/${task.escrowTxHash}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: DS.fontMono, fontSize: "0.75rem", fontWeight: 700, color: DS.text, textDecoration: "underline" }}>
                ESCROW TX: {task.escrowTxHash}
              </a>
            )}
            {task.settlementTxHash && (
              <a href={`${SOLANA_EXPLORER}/${task.settlementTxHash}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: DS.fontMono, fontSize: "0.75rem", fontWeight: 700, color: DS.text, textDecoration: "underline" }}>
                SETTLEMENT TX: {task.settlementTxHash}
              </a>
            )}
          </div>
        )}

        {/* Event Log */}
        {task.log.length > 0 && (
          <div style={{ padding: "16px 24px" }}>
            <span style={{ ...bandLabel, fontSize: "0.7rem", color: DS.textMuted, display: "block", marginBottom: 10 }}>EVENT LOG</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {task.log.map((entry) => (
                <div key={entry.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700 }}>
                  <span style={{ color: DS.textMuted, flexShrink: 0 }}>{entry.timestamp}</span>
                  <span className="ds-accent-text" style={{ textTransform: "uppercase", flexShrink: 0 }}>[{entry.eventType}]</span>
                  <span>{entry.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
