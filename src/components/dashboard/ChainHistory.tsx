"use client";

import { useState, useEffect } from "react";
import { useWalletStore } from "@/store/walletStore";

interface ChainStep {
  agentName: string;
  capabilityId: string;
  estimatedCost: string;
  status: string;
  artifact?: string;
  escrowTxHash?: string;
  settlementTxHash?: string;
  error?: string;
}

interface Chain {
  id: string;
  status: string;
  totalCost: string;
  totalSpent: string;
  currentStep: number;
  steps: ChainStep[];
  createdAt: string;
  completedAt?: string;
  finalArtifact?: string;
}

const DS = {
  bg: "#e6e5e0",
  border: "#000000",
  text: "#000000",
  textMuted: "#666666",
  dark: "#222222",
  green: "#7cb342",
  error: "#c62828",
  cyan: "#4dd0e1",
  fontPrimary: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  fontMono: '"Courier New", Courier, monospace',
};

const STATUS_BG: Record<string, { bg: string; text: string }> = {
  completed: { bg: DS.green, text: "#fff" },
  failed: { bg: DS.error, text: "#fff" },
  executing: { bg: "#3b6fa0", text: "#fff" },
  pending: { bg: "#bbb", text: DS.dark },
};

function StepDot({ status }: { status: string }) {
  const s: React.CSSProperties = {
    width: 10,
    height: 10,
    borderRadius: "50%",
    flexShrink: 0,
  };
  if (status === "completed") return <span style={{ ...s, backgroundColor: DS.green }} />;
  if (status === "executing")
    return (
      <span
        style={{
          ...s,
          border: `2px solid #3b6fa0`,
          borderTopColor: "transparent",
          animation: "spin 1s linear infinite",
          backgroundColor: "transparent",
        }}
      />
    );
  if (status === "failed") return <span style={{ ...s, backgroundColor: DS.error }} />;
  return <span style={{ ...s, border: `1px solid #bbb`, backgroundColor: "transparent" }} />;
}

export default function ChainHistory() {
  const { address } = useWalletStore();
  const [chains, setChains] = useState<Chain[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    fetch(`/api/chain?caller=${encodeURIComponent(address)}`)
      .then((r) => r.json())
      .then((d) => setChains(d.chains ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [address]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!address) return null;

  const bandLabel: React.CSSProperties = {
    fontFamily: DS.fontMono,
    fontSize: "0.7rem",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
  };

  return (
    <div>
      {/* Header */}
      <div
        style={{
          padding: "12px 30px",
          borderBottom: `1px solid ${DS.border}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ ...bandLabel, color: DS.textMuted }}>PIPELINE HISTORY</span>
        <span style={{ ...bandLabel, color: DS.textMuted, fontWeight: 400 }}>
          {chains.length} PIPELINES
        </span>
      </div>

      {loading ? (
        <div style={{ padding: "40px 30px", textAlign: "center" }}>
          <p style={{ ...bandLabel, color: DS.textMuted }}>LOADING...</p>
        </div>
      ) : chains.length === 0 ? (
        <div style={{ padding: "40px 30px", textAlign: "center" }}>
          <p style={{ ...bandLabel, color: DS.textMuted, fontWeight: 400 }}>
            No pipelines yet. Run one from Twin.
          </p>
        </div>
      ) : (
        <div>
          {chains.map((chain) => {
            const st = STATUS_BG[chain.status] || STATUS_BG.pending;
            return (
              <div key={chain.id} style={{ borderBottom: `1px solid ${DS.border}` }}>
                {/* Chain row */}
                <button
                  onClick={() => toggle(chain.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "10px 30px",
                    backgroundColor: "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: DS.fontMono,
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    textAlign: "left",
                    color: DS.text,
                  }}
                >
                  <span
                    className="mp-white-text"
                    style={{
                      fontSize: "0.7rem",
                      padding: "3px 10px",
                      backgroundColor: st.bg,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {chain.status}
                  </span>
                  <span style={{ flex: 1 }}>{chain.steps.length} STEPS</span>
                  <span>{chain.totalSpent !== "0.00" ? chain.totalSpent : chain.totalCost} USDC</span>
                  <span style={{ color: DS.textMuted, fontWeight: 400 }}>
                    {new Date(chain.createdAt).toLocaleTimeString()}
                  </span>
                  <span style={{ color: DS.textMuted }}>
                    {expanded.has(chain.id) ? "—" : "+"}
                  </span>
                </button>

                {/* Expanded */}
                {expanded.has(chain.id) && (
                  <div style={{ padding: "0 30px 16px", borderTop: `1px solid #ccc` }}>
                    {chain.steps.map((step, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "6px 0",
                          fontFamily: DS.fontMono,
                          fontSize: "0.7rem",
                        }}
                      >
                        <StepDot status={step.status} />
                        <span style={{ color: DS.textMuted, width: 16 }}>{i + 1}.</span>
                        <span style={{ flex: 1, fontWeight: 700 }}>{step.agentName}</span>
                        <span style={{ color: DS.textMuted }}>{step.capabilityId}</span>
                        <span style={{ fontWeight: 700 }}>{step.estimatedCost} USDC</span>
                      </div>
                    ))}
                    {/* Chain footer */}
                    <div
                      style={{
                        display: "flex",
                        gap: 16,
                        marginTop: 10,
                        paddingTop: 8,
                        borderTop: `1px solid #ccc`,
                        fontFamily: DS.fontMono,
                        fontSize: "0.75rem",
                        color: DS.textMuted,
                      }}
                    >
                      <span>ID: {chain.id}</span>
                      {chain.completedAt && (
                        <span>
                          DURATION:{" "}
                          {(
                            (new Date(chain.completedAt).getTime() -
                              new Date(chain.createdAt).getTime()) /
                            1000
                          ).toFixed(1)}
                          s
                        </span>
                      )}
                      <span style={{ marginLeft: "auto", fontWeight: 700 }}>
                        TOTAL: {chain.totalSpent} USDC
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
