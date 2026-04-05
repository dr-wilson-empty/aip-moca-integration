"use client";

import { useState, useEffect, useCallback } from "react";
import BudgetDepositModal from "./BudgetDepositModal";
import BudgetHistoryModal from "./BudgetHistoryModal";

interface BudgetData {
  agent_did: string;
  balance: number;
  max_per_task: number;
  total_spent: number;
  total_deposited: number;
}

export default function AgentBudget({ agentDid }: { agentDid: string }) {
  const [budget, setBudget] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editingMax, setEditingMax] = useState(false);
  const [maxValue, setMaxValue] = useState("");
  const [saving, setSaving] = useState(false);

  const loadBudget = useCallback(() => {
    fetch(`/api/budget?agentDid=${encodeURIComponent(agentDid)}`)
      .then((r) => r.json())
      .then((data) => {
        setBudget(data.budget ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [agentDid]);

  useEffect(() => {
    loadBudget();
  }, [loadBudget]);

  const handleSaveMax = async () => {
    const parsed = parseFloat(maxValue);
    if (isNaN(parsed) || parsed <= 0) return;
    setSaving(true);
    try {
      await fetch("/api/budget", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentDid, maxPerTask: parsed }),
      });
      loadBudget();
      setEditingMax(false);
    } catch { /* ignore */ }
    setSaving(false);
  };

  if (loading) return null;

  return (
    <>
      <div className="mt-2 flex items-center gap-3 font-mono text-sm flex-wrap">
        {budget ? (
          <>
            <span className="text-accent font-medium">{budget.balance.toFixed(2)} USDC</span>
            <span className="text-muted/40">|</span>
            <span className="text-muted/60">spent: {budget.total_spent.toFixed(2)}</span>
            <span className="text-muted/40">|</span>

            {editingMax ? (
              <span className="flex items-center gap-1">
                <span className="text-muted/60">max/task:</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.01"
                  value={maxValue}
                  onChange={(e) => setMaxValue(e.target.value)}
                  className="w-16 bg-bg-base border border-mint/20 rounded px-1 py-0.5 text-[11px] text-accent focus:outline-none"
                  autoFocus
                />
                <button onClick={handleSaveMax} disabled={saving} className="text-[10px] text-accent hover:text-mint">
                  {saving ? "..." : "Save"}
                </button>
                <button onClick={() => setEditingMax(false)} className="text-[10px] text-muted hover:text-red-400">
                  Cancel
                </button>
              </span>
            ) : (
              <button
                onClick={() => { setMaxValue(budget.max_per_task.toFixed(2)); setEditingMax(true); }}
                className="text-muted/60 hover:text-mint transition-colors"
                title="Click to edit max per task"
              >
                max/task: {budget.max_per_task.toFixed(2)}
              </button>
            )}
          </>
        ) : (
          <span className="text-muted/60">No budget</span>
        )}

        <span className="text-muted/40">|</span>
        <button
          onClick={() => setShowDeposit(true)}
          className="text-[11px] text-mint border border-mint/20 px-2 py-0.5 rounded hover:bg-mint/10 transition-colors"
        >
          Deposit USDC
        </button>

        {budget && (
          <button
            onClick={() => setShowHistory(true)}
            className="text-[11px] text-muted hover:text-mint transition-colors"
          >
            History
          </button>
        )}
      </div>

      {showDeposit && (
        <BudgetDepositModal
          agentDid={agentDid}
          onClose={() => setShowDeposit(false)}
          onDeposited={loadBudget}
        />
      )}

      {showHistory && (
        <BudgetHistoryModal
          agentDid={agentDid}
          onClose={() => setShowHistory(false)}
        />
      )}
    </>
  );
}
