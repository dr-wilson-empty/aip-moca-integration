import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/client";

/**
 * GET /api/agent-card/analytics?did=xxx
 * Returns analytics for an agent: task count, revenue, avg rating, recent activity.
 */
export async function GET(request: NextRequest) {
  const did = request.nextUrl.searchParams.get("did");
  if (!did) return NextResponse.json({ error: "did required" }, { status: 400 });

  const sb = getSupabase();

  // Tasks where this agent was used (match by DID or partial DID for hosted agents)
  const { data: tasks } = await sb
    .from("tasks")
    .select("state, amount, created_at")
    .eq("agent_did", did);

  // Also check budget transactions (for orchestrator agents that delegate)
  const { data: budgetTasks } = await sb
    .from("agent_budget_txns")
    .select("type, amount, created_at, task_id")
    .eq("agent_did", did);

  const allTasks = tasks ?? [];
  const allBudgetTxns = budgetTasks ?? [];
  const budgetSpends = allBudgetTxns.filter((t) => t.type === "spend");
  const budgetRefunds = allBudgetTxns.filter((t) => t.type === "refund");
  const completed = allTasks.filter((t) => t.state === "COMPLETED");
  const grossRevenue = completed.reduce((sum, t) => sum + parseFloat(t.amount || "0"), 0);
  const totalRevenue = grossRevenue * 0.8; // Net after 20% platform commission
  const totalSpendSum = budgetSpends.reduce((sum, t) => sum + parseFloat(String(t.amount || "0")), 0);
  const totalRefundSum = budgetRefunds.reduce((sum, t) => sum + parseFloat(String(t.amount || "0")), 0);
  const totalBudgetSpent = totalSpendSum - totalRefundSum; // Net spent after refunds

  // For orchestrators: count unique orchestration sessions (not individual steps)
  // Each fee txn has task_id like "orch_abc123_fee" — unique "orch_abc123" = one session
  const isOrchestrator = did.includes("orch-");
  let orchestrationCount = 0;
  if (isOrchestrator) {
    const feeTxns = budgetSpends.filter((t) => String(t.task_id || "").endsWith("_fee"));
    const sessionIds = new Set(feeTxns.map((t) => String(t.task_id).replace(/_fee$/, "")));
    orchestrationCount = sessionIds.size;
  }
  const effectiveTaskCount = isOrchestrator ? orchestrationCount : allTasks.length;
  const effectiveCompleted = isOrchestrator ? orchestrationCount : completed.length;
  const effectiveFailed = isOrchestrator ? 0 : allTasks.filter((t) => t.state === "FAILED").length;

  // Daily activity (last 7 days)
  const now = Date.now();
  const days: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    days[d.toISOString().slice(0, 10)] = 0;
  }
  // For orchestrators: count sessions per day (fee txns, deduplicated by session)
  // For regular agents: count tasks per day
  if (isOrchestrator) {
    const feeTxns = budgetSpends.filter((t) => String(t.task_id || "").endsWith("_fee"));
    const seenSessions = new Set<string>();
    for (const t of feeTxns) {
      const sessionId = String(t.task_id).replace(/_fee$/, "");
      const day = t.created_at?.slice(0, 10);
      const key = `${day}_${sessionId}`;
      if (day && day in days && !seenSessions.has(key)) {
        seenSessions.add(key);
        days[day]++;
      }
    }
  } else {
    for (const t of allTasks) {
      const day = t.created_at?.slice(0, 10);
      if (day && day in days) days[day]++;
    }
  }

  // Ratings
  const { data: ratings } = await sb
    .from("ratings")
    .select("rating")
    .eq("agent_did", did);

  const ratingList = ratings ?? [];
  const avgRating = ratingList.length > 0
    ? ratingList.reduce((s, r) => s + r.rating, 0) / ratingList.length
    : 0;

  return NextResponse.json({
    totalTasks: effectiveTaskCount,
    completedTasks: effectiveCompleted,
    failedTasks: effectiveFailed,
    totalRevenue: isOrchestrator ? null : totalRevenue.toFixed(2),
    totalSpent: totalBudgetSpent.toFixed(2),
    isOrchestrator,
    avgRating: avgRating.toFixed(1),
    ratingCount: ratingList.length,
    dailyActivity: Object.entries(days).map(([date, count]) => ({ date, count })),
  });
}
