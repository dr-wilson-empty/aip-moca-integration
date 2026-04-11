"use client";

import { useState, useEffect, useCallback } from "react";
import BudgetDepositModal from "./BudgetDepositModal";
import BudgetHistoryModal from "./BudgetHistoryModal";

const DS = {
  bg: "#e6e5e0",
  border: "#000000",
  text: "#000000",
  textMuted: "#666666",
  green: "#7cb342",
  fontMono: '"Courier New", Courier, monospace',
};

interface BudgetData { agent_did: string; balance: number; max_per_task: number; total_spent: number; total_deposited: number; }

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
      .then((data) => { setBudget(data.budget ?? null); setLoading(false); })
      .catch(() => setLoading(false));
  }, [agentDid]);

  useEffect(() => { loadBudget(); }, [loadBudget]);

  const handleSaveMax = async () => {
    const parsed = parseFloat(maxValue);
    if (isNaN(parsed) || parsed <= 0) return;
    setSaving(true);
    try { await fetch("/api/budget", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentDid, maxPerTask: parsed }) }); loadBudget(); setEditingMax(false); } catch {}
    setSaving(false);
  };

  if (loading) return null;

  const btnSmall: React.CSSProperties = { fontFamily: DS.fontMono, fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", padding: "4px 10px", border: `1px solid ${DS.border}`, backgroundColor: "transparent", cursor: "pointer", color: DS.text };

  return (
    <>
      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, flexWrap: "wrap" }}>
        {budget ? (
          <>
            <span className="ds-accent-text">{budget.balance.toFixed(2)} USDC</span>
            <span style={{ color: "#ccc" }}>|</span>
            <span style={{ color: DS.textMuted }}>SPENT: {budget.total_spent.toFixed(2)}</span>
            <span style={{ color: "#ccc" }}>|</span>

            {editingMax ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: DS.textMuted, fontSize: "0.7rem" }}>MAX/TASK:</span>
                <input type="number" step="0.1" min="0.01" value={maxValue} onChange={(e) => setMaxValue(e.target.value)} autoFocus style={{ width: 60, fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, padding: "4px 6px", border: `1px solid ${DS.border}`, backgroundColor: DS.bg, outline: "none", color: DS.text }} />
                <button onClick={handleSaveMax} disabled={saving} className="ds-accent-text" style={{ ...btnSmall, fontSize: "0.65rem" }}>{saving ? "..." : "SAVE"}</button>
                <button onClick={() => setEditingMax(false)} className="ds-error-text" style={{ ...btnSmall, fontSize: "0.65rem" }}>X</button>
              </span>
            ) : (
              <button onClick={() => { setMaxValue(budget.max_per_task.toFixed(2)); setEditingMax(true); }} style={{ color: DS.textMuted, background: "none", border: "none", cursor: "pointer", fontFamily: DS.fontMono, fontSize: "0.8rem", fontWeight: 700, textDecoration: "underline" }}>
                MAX/TASK: {budget.max_per_task.toFixed(2)}
              </button>
            )}
          </>
        ) : (
          <span style={{ color: DS.textMuted }}>NO BUDGET</span>
        )}

        <span style={{ color: "#ccc" }}>|</span>
        <button onClick={() => setShowDeposit(true)} style={btnSmall}>DEPOSIT</button>
        {budget && <button onClick={() => setShowHistory(true)} style={{ ...btnSmall, border: "none", textDecoration: "underline" }}>HISTORY</button>}
      </div>

      {showDeposit && <BudgetDepositModal agentDid={agentDid} onClose={() => setShowDeposit(false)} onDeposited={loadBudget} />}
      {showHistory && <BudgetHistoryModal agentDid={agentDid} onClose={() => setShowHistory(false)} />}
    </>
  );
}
