"use client";

import { useState, useEffect } from "react";

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

interface BudgetTxn { id: string; type: "deposit" | "spend" | "refund" | "release"; amount: number; task_id?: string; target_agent_did?: string; tx_hash?: string; created_at?: string; }

const TYPE_CONFIG: Record<string, { label: string; color: string; sign: string }> = {
  deposit: { label: "DEPOSIT", color: DS.green, sign: "+" },
  spend: { label: "SPEND", color: DS.error, sign: "-" },
  refund: { label: "REFUND", color: "#b8913a", sign: "+" },
  release: { label: "RELEASE", color: "#7c3aed", sign: "-" },
};

function agentLabel(did?: string): string {
  if (!did) return "";
  const parts = did.split(":");
  if (parts.length >= 4) return parts.slice(3).join(":");
  if (parts[2] === "platform") return "platform";
  return did.slice(-12);
}

export default function BudgetHistoryModal({ agentDid, onClose }: { agentDid: string; onClose: () => void }) {
  const [txns, setTxns] = useState<BudgetTxn[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/budget?agentDid=${encodeURIComponent(agentDid)}&history=true`)
      .then((r) => r.json())
      .then((data) => { setTxns(data.transactions ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [agentDid]);

  const totalSpent = txns.filter((t) => t.type === "spend").reduce((s, t) => s + t.amount, 0);
  const totalDeposited = txns.filter((t) => t.type === "deposit").reduce((s, t) => s + t.amount, 0);

  const bandLabel: React.CSSProperties = { fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)", padding: 16 }} onClick={onClose}>
      <div style={{ width: "100%", maxWidth: 560, border: `1px solid ${DS.border}`, backgroundColor: DS.bg, display: "flex", flexDirection: "column", maxHeight: "70vh" }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: "16px 24px", borderBottom: `1px solid ${DS.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#d5d0c8" }}>
          <span style={bandLabel}>BUDGET HISTORY</span>
          <button onClick={onClose} style={{ ...bandLabel, fontSize: "1rem", background: "none", border: "none", cursor: "pointer" }}>X</button>
        </div>

        {/* Summary */}
        {txns.length > 0 && (
          <div style={{ padding: "12px 24px", borderBottom: `1px solid ${DS.border}`, display: "flex", gap: 20, fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700 }}>
            <span>DEPOSITED: <span className="ds-accent-text">{totalDeposited.toFixed(2)}</span> USDC</span>
            <span>SPENT: <span className="ds-error-text">{totalSpent.toFixed(2)}</span> USDC</span>
            <span style={{ color: DS.textMuted }}>TXNS: {txns.length}</span>
          </div>
        )}

        {/* Transactions */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading ? (
            <p style={{ padding: "30px 24px", textAlign: "center", ...bandLabel, color: DS.textMuted }}>LOADING...</p>
          ) : txns.length === 0 ? (
            <p style={{ padding: "30px 24px", textAlign: "center", ...bandLabel, color: DS.textMuted, fontWeight: 400 }}>NO TRANSACTIONS YET</p>
          ) : (
            <div>
              {txns.map((txn) => {
                const cfg = TYPE_CONFIG[txn.type] || { label: txn.type, color: DS.textMuted, sign: "" };
                const target = agentLabel(txn.target_agent_did);
                return (
                  <div key={txn.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 24px", borderBottom: "1px solid #ccc", fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700 }}>
                    <span style={{ width: 70, fontSize: "0.7rem", color: cfg.color }} className={cfg.sign === "+" ? "ds-accent-text" : "ds-error-text"}>{cfg.label}</span>
                    <span style={{ width: 70, textAlign: "right", color: cfg.sign === "+" ? DS.green : DS.error }}>{cfg.sign}{txn.amount.toFixed(2)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {txn.type === "spend" && target && <span style={{ fontSize: "0.75rem" }}>{target}</span>}
                      {txn.type === "deposit" && <span style={{ fontSize: "0.75rem" }}>Wallet deposit</span>}
                      {txn.type === "refund" && <span style={{ fontSize: "0.75rem" }}>Task refunded</span>}
                      {txn.task_id && <span style={{ fontSize: "0.65rem", color: DS.textMuted, display: "block" }}>{txn.task_id}</span>}
                    </div>
                    <span style={{ fontSize: "0.7rem", color: DS.textMuted, flexShrink: 0 }}>{txn.created_at ? new Date(txn.created_at).toLocaleDateString() : ""}</span>
                    {txn.tx_hash && <a href={`https://explorer.solana.com/tx/${txn.tx_hash}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.65rem", color: DS.textMuted, textDecoration: "underline", flexShrink: 0 }}>TX</a>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
