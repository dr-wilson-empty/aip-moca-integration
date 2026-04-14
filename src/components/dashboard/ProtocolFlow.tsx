"use client";

import { useTaskStore } from "@/store/taskStore";
import type { ProtocolNode } from "@/types/aip";

const DS = {
  border: "#000000",
  text: "#000000",
  textMuted: "#666666",
  green: "#7cb342",
  error: "#c62828",
  fontPrimary: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  fontMono: '"Courier New", Courier, monospace',
};

function NodeDot({ state }: { state: ProtocolNode["state"] }) {
  const base: React.CSSProperties = {
    width: 16,
    height: 16,
    borderRadius: "50%",
    border: `2px solid ${DS.border}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  if (state === "done")
    return <div style={{ ...base, backgroundColor: DS.green, borderColor: DS.green }} />;
  if (state === "error")
    return <div style={{ ...base, backgroundColor: DS.error, borderColor: DS.error }} />;
  if (state === "active")
    return (
      <div style={{ ...base, borderColor: DS.text }}>
        <span
          style={{
            width: 8,
            height: 8,
            border: `2px solid ${DS.text}`,
            borderTopColor: "transparent",
            borderRadius: "50%",
            display: "block",
            animation: "spin 1s linear infinite",
          }}
        />
      </div>
    );
  return <div style={{ ...base, backgroundColor: "transparent", borderColor: "#bbb" }} />;
}

function Connector({ done }: { done: boolean }) {
  return (
    <div
      style={{
        flex: 1,
        height: 2,
        backgroundColor: done ? DS.green : "#ccc",
        transition: "background-color 0.5s",
      }}
    />
  );
}

export default function ProtocolFlow() {
  const { nodes } = useTaskStore();

  return (
    <div style={{ borderBottom: `1px solid ${DS.border}`, padding: "20px 30px" }}>
      <span
        style={{
          fontFamily: DS.fontMono,
          fontSize: "0.7rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: DS.textMuted,
          display: "block",
          marginBottom: 16,
        }}
      >
        PROTOCOL FLOW
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {nodes.map((node, i) => (
          <div
            key={node.id}
            style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                flexShrink: 0,
                minWidth: 80,
              }}
            >
              <NodeDot state={node.state} />
              <span
                style={{
                  fontFamily: DS.fontMono,
                  fontSize: "0.65rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  textAlign: "center",
                  color:
                    node.state === "done"
                      ? DS.green
                      : node.state === "error"
                      ? DS.error
                      : node.state === "active"
                      ? DS.text
                      : DS.textMuted,
                }}
                className={
                  node.state === "done"
                    ? "ds-accent-text"
                    : node.state === "error"
                    ? "ds-error-text"
                    : node.state === "active"
                    ? ""
                    : "ds-muted-text"
                }
              >
                {node.label}
              </span>
              {node.timestamp && (
                <span
                  className="ds-muted-text"
                  style={{
                    fontFamily: DS.fontMono,
                    fontSize: "0.5rem",
                  }}
                >
                  {node.timestamp}
                </span>
              )}
            </div>
            {i < nodes.length - 1 && <Connector done={node.state === "done"} />}
          </div>
        ))}
      </div>
    </div>
  );
}
