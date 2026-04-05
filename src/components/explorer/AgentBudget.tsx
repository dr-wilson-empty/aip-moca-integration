"use client";

import { useState, useEffect } from "react";

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

  useEffect(() => {
    setLoading(true);
    fetch(`/api/budget?agentDid=${encodeURIComponent(agentDid)}`)
      .then((r) => r.json())
      .then((data) => {
        setBudget(data.budget ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [agentDid]);

  if (loading) return null;
  if (!budget) return null;

  return (
    <div className="mt-2 flex items-center gap-3 font-mono text-sm">
      <span className="text-accent font-medium">{budget.balance.toFixed(2)} USDC</span>
      <span className="text-muted/40">|</span>
      <span className="text-muted/60">spent: {budget.total_spent.toFixed(2)}</span>
      <span className="text-muted/40">|</span>
      <span className="text-muted/60">max/task: {budget.max_per_task.toFixed(2)}</span>
    </div>
  );
}
