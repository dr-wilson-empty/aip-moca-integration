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

const TYPE_STYLES: Record<string, string> = {
  deposit: "text-accent",
  spend: "text-red-400",
  refund: "text-yellow-400",
  release: "text-purple-400",
};

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-base/80 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="w-full max-w-lg border border-forest-mid bg-bg-base p-6 rounded-2xl flex flex-col gap-4 max-h-[70vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg text-mint uppercase">Budget History</h3>
          <button onClick={onClose} className="font-mono text-xs text-muted hover:text-off-white">✕</button>
        </div>

        <div className="overflow-y-auto flex-1">
          {loading ? (
            <p className="font-mono text-xs text-muted animate-pulse py-4 text-center">Loading...</p>
          ) : txns.length === 0 ? (
            <p className="font-mono text-xs text-muted py-4 text-center">No transactions yet.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {txns.map((txn) => (
                <div key={txn.id} className="flex items-center gap-3 py-2 border-b border-forest-deep/20 last:border-0">
                  <span className={`font-mono text-[10px] uppercase w-14 ${TYPE_STYLES[txn.type] || "text-muted"}`}>
                    {txn.type}
                  </span>
                  <span className={`font-mono text-sm ${txn.type === "deposit" || txn.type === "refund" ? "text-accent" : "text-red-400"}`}>
                    {txn.type === "deposit" || txn.type === "refund" ? "+" : "-"}{txn.amount.toFixed(2)}
                  </span>
                  <span className="font-mono text-[10px] text-muted flex-1 truncate">
                    {txn.task_id || ""}
                  </span>
                  <span className="font-mono text-[10px] text-muted/50">
                    {txn.created_at ? new Date(txn.created_at).toLocaleDateString() : ""}
                  </span>
                  {txn.tx_hash && (
                    <a
                      href={`https://explorer.solana.com/tx/${txn.tx_hash}?cluster=devnet`}
                      target="_blank" rel="noopener noreferrer"
                      className="font-mono text-[9px] text-muted hover:text-accent shrink-0"
                    >
                      tx
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
