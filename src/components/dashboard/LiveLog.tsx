"use client";

import { useEffect, useRef } from "react";
import { useTaskStore } from "@/store/taskStore";
import ArtifactRenderer, { parseArtifact } from "@/components/ui/ArtifactRenderer";

const SOLANA_EXPLORER = "https://explorer.solana.com/tx";

const DS = {
  bg: "#e6e5e0",
  border: "#000000",
  text: "#000000",
  textMuted: "#666666",
  dark: "#222222",
  green: "#7cb342",
  error: "#c62828",
  fontPrimary: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  fontMono: '"Courier New", Courier, monospace',
};

const EVENT_COLORS: Record<string, string> = {
  IDENTITY: "ds-accent-text",
  PAYMENT: "ds-yellow-text",
  REQUEST: "ds-cyan-text",
  PROCESSING: "",
  ERROR: "ds-error-text",
  FAIL: "ds-error-text",
  REFUND: "ds-yellow-text",
  COMPLETE: "ds-accent-text",
  SETTLEMENT: "ds-accent-text",
};

function eventClass(type: string): string {
  for (const [key, cls] of Object.entries(EVENT_COLORS)) {
    if (type.includes(key)) return cls;
  }
  return "";
}

export default function LiveLog() {
  const { log, artifact, escrowTxHash, settlementTxHash, taskState } = useTaskStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  return (
    <div style={{ borderBottom: `1px solid ${DS.border}` }}>
      {/* Header */}
      <div
        style={{
          padding: "12px 30px",
          fontFamily: DS.fontMono,
          fontSize: "0.7rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          borderBottom: `1px solid ${DS.border}`,
          color: DS.textMuted,
        }}
      >
        LIVE LOG
      </div>

      {/* Artifact — only on success */}
      {artifact && taskState === "COMPLETED" && (
        <div
          style={{
            padding: "16px 30px",
            borderBottom: `1px solid ${DS.border}`,
            backgroundColor: "#e8f0e6",
          }}
        >
          <span
            className="ds-accent-text"
            style={{
              fontFamily: DS.fontMono,
              fontSize: "0.85rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              display: "block",
              marginBottom: 6,
            }}
          >
            TASK ARTIFACT
          </span>
          <div style={{ fontSize: "1.05rem", lineHeight: 1.6 }}>
            <ArtifactRenderer artifact={parseArtifact(artifact)} />
          </div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            {escrowTxHash && (
              <a
                href={`${SOLANA_EXPLORER}/${escrowTxHash}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="ds-muted-text"
                style={{
                  fontFamily: DS.fontMono,
                  fontSize: "0.7rem",
                  textDecoration: "none",
                }}
              >
                ESCROW TX: {escrowTxHash.slice(0, 20)}...
              </a>
            )}
            {settlementTxHash && (
              <a
                href={`${SOLANA_EXPLORER}/${settlementTxHash}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="ds-muted-text"
                style={{
                  fontFamily: DS.fontMono,
                  fontSize: "0.7rem",
                  textDecoration: "none",
                }}
              >
                SETTLEMENT TX: {settlementTxHash.slice(0, 20)}...
              </a>
            )}
          </div>
        </div>
      )}

      {/* Failure box */}
      {taskState === "FAILED" && (
        <div
          style={{
            padding: "16px 30px",
            borderBottom: `1px solid ${DS.border}`,
            backgroundColor: "#f5e6e6",
          }}
        >
          <span
            className="ds-error-text"
            style={{
              fontFamily: DS.fontMono,
              fontSize: "0.75rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              display: "block",
              marginBottom: 6,
            }}
          >
            TASK FAILED
          </span>
          <p
            style={{
              fontFamily: DS.fontMono,
              fontSize: "0.75rem",
              lineHeight: 1.4,
            }}
          >
            Execution error occurred. Funds have been refunded to your wallet.
          </p>
          {escrowTxHash && (
            <a
              href={`${SOLANA_EXPLORER}/${escrowTxHash}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="ds-muted-text"
              style={{
                fontFamily: DS.fontMono,
                fontSize: "0.7rem",
                textDecoration: "none",
                marginTop: 6,
                display: "inline-block",
              }}
            >
              ESCROW TX (REFUNDED): {escrowTxHash.slice(0, 20)}...
            </a>
          )}
        </div>
      )}

      {/* Log entries */}
      <div
        style={{
          maxHeight: 300,
          overflowY: "auto",
          padding: "16px 30px",
          backgroundColor: "transparent",
        }}
      >
        {log.length === 0 && (
          <p
            className="ds-muted-text"
            style={{
              fontFamily: DS.fontMono,
              fontSize: "0.75rem",
            }}
          >
            Waiting for task to start...
          </p>
        )}
        {log.map((entry) => (
          <div
            key={entry.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              marginBottom: 4,
              fontFamily: DS.fontMono,
              fontSize: "0.8rem",
              fontWeight: 700,
            }}
          >
            <span className="ds-muted-text" style={{ flexShrink: 0 }}>
              {entry.timestamp}
            </span>
            <span
              className={eventClass(entry.eventType)}
              style={{
                textTransform: "uppercase",
                flexShrink: 0,
                fontWeight: 700,
              }}
            >
              [{entry.eventType}]
            </span>
            <span style={{ color: DS.text }}>
              {entry.message}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Status footer */}
      {taskState === "COMPLETED" && (
        <div
          style={{
            padding: "10px 30px",
            borderTop: `1px solid ${DS.border}`,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: DS.green,
              display: "inline-block",
            }}
          />
          <span
            className="ds-accent-text"
            style={{
              fontFamily: DS.fontMono,
              fontSize: "0.75rem",
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            Task Completed — Payment Released
          </span>
        </div>
      )}

      {taskState === "FAILED" && (
        <div
          style={{
            padding: "10px 30px",
            borderTop: `1px solid ${DS.border}`,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: DS.error,
              display: "inline-block",
            }}
          />
          <span
            className="ds-error-text"
            style={{
              fontFamily: DS.fontMono,
              fontSize: "0.75rem",
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            Task Failed — Escrow Refunded
          </span>
        </div>
      )}
    </div>
  );
}
