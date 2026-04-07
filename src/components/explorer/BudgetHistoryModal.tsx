"use client";

import { useState, useEffect } from "react";

interface BudgetTxn {
  id: string;
  type: "deposit" | "spend" | "refund" | "release";
  amount: number;
  task_id?: string;
  target_agent_did?: string;
  tx_hash?: string;
  created_at?: string;
}

const TYPE_CONFIG: Record<string, { label: string; color: string; sign: string }> = {
  deposit: { label: "DEPOSIT", color: "text-accent", sign: "+" },
  spend: { label: "SPEND", color: "text-red-400", sign: "-" },
  refund: { label: "REFUND", color: "text-yellow-400", sign: "+" },
  release: { label: "RELEASE", color: "text-purple-400", sign: "-" },
};

/** Extract readable agent name from DID */
function agentLabel(did?: string): string {
  if (!did) return "";
  // did:aip:XXXXXXXX:agent-name or did:aip:platform:web-search or did:key:...
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
      .then((data) => {
        setTxns(data.transactions ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [agentDid]);

  const totalSpent = txns.filter((t) => t.type === "spend").reduce((s, t) => s + t.amount, 0);
  const totalDeposited = txns.filter((t) => t.type === "deposit").reduce((s, t) => s + t.amount, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-base/80 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="w-full max-w-lg border border-forest-mid bg-bg-base p-6 rounded-2xl flex flex-col gap-4 max-h-[70vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg text-mint uppercase">Budget History</h3>
          <button onClick={onClose} className="font-mono text-xs text-muted hover:text-off-white">✕</button>
        </div>

        {/* Summary */}
        {txns.length > 0 && (
          <div className="flex gap-4 font-mono text-xs border-b border-forest-deep/20 pb-3">
            <span className="text-accent">Deposited: {totalDeposited.toFixed(2)} USDC</span>
            <span className="text-red-400">Spent: {totalSpent.toFixed(2)} USDC</span>
            <span className="text-muted">Txns: {txns.length}</span>
          </div>
        )}

        <div className="overflow-y-auto flex-1">
          {loading ? (
            <p className="font-mono text-xs text-muted animate-pulse py-4 text-center">Loading...</p>
          ) : txns.length === 0 ? (
            <p className="font-mono text-xs text-muted py-4 text-center">No transactions yet.</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {txns.map((txn) => {
                const cfg = TYPE_CONFIG[txn.type] || { label: txn.type, color: "text-muted", sign: "" };
                const target = agentLabel(txn.target_agent_did);

                return (
                  <div key={txn.id} className="flex items-center gap-2 py-2 border-b border-forest-deep/15 last:border-0">
                    {/* Type badge */}
                    <span className={`font-mono text-[9px] uppercase w-16 ${cfg.color}`}>
                      {cfg.label}
                    </span>

                    {/* Amount */}
                    <span className={`font-mono text-sm w-16 text-right ${cfg.sign === "+" ? "text-accent" : "text-red-400"}`}>
                      {cfg.sign}{txn.amount.toFixed(2)}
                    </span>

                    {/* Description */}
                    <div className="flex-1 min-w-0 flex flex-col">
                      {txn.type === "spend" && target && (
                        <span className="font-mono text-[11px] text-off-white truncate">
                          → {target}
                        </span>
                      )}
                      {txn.type === "deposit" && txn.tx_hash && (
                        <span className="font-mono text-[11px] text-off-white">
                          Wallet deposit
                        </span>
                      )}
                      {txn.type === "refund" && (
                        <span className="font-mono text-[11px] text-yellow-400">
                          Task refunded
                        </span>
                      )}
                      {txn.task_id && (
                        <span className="font-mono text-[9px] text-muted/50 truncate">
                          {txn.task_id}
                        </span>
                      )}
                    </div>

                    {/* Date */}
                    <span className="font-mono text-[10px] text-muted/40 shrink-0">
                      {txn.created_at ? new Date(txn.created_at).toLocaleDateString() : ""}
                    </span>

                    {/* Tx link */}
                    {txn.tx_hash && (
                      <a
                        href={`https://explorer.solana.com/tx/${txn.tx_hash}?cluster=devnet`}
                        target="_blank" rel="noopener noreferrer"
                        className="font-mono text-[9px] text-muted hover:text-accent shrink-0"
                      >
                        tx↗
                      </a>
                    )}
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
