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

  // Tasks where this agent was used
  const { data: tasks } = await sb
    .from("tasks")
    .select("state, amount, created_at")
    .eq("agent_did", did);

  const allTasks = tasks ?? [];
  const completed = allTasks.filter((t) => t.state === "COMPLETED");
  const totalRevenue = completed.reduce((sum, t) => sum + parseFloat(t.amount || "0"), 0);

  // Daily activity (last 7 days)
  const now = Date.now();
  const days: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    days[d.toISOString().slice(0, 10)] = 0;
  }
  for (const t of completed) {
    const day = t.created_at?.slice(0, 10);
    if (day && day in days) days[day]++;
  }

  // Ratings
  const { data: ratings } = await sb
    .from("agent_ratings")
    .select("rating")
    .eq("agent_did", did);

  const ratingList = ratings ?? [];
  const avgRating = ratingList.length > 0
    ? ratingList.reduce((s, r) => s + r.rating, 0) / ratingList.length
    : 0;

  return NextResponse.json({
    totalTasks: allTasks.length,
    completedTasks: completed.length,
    failedTasks: allTasks.filter((t) => t.state === "FAILED").length,
    totalRevenue: totalRevenue.toFixed(2),
    avgRating: avgRating.toFixed(1),
    ratingCount: ratingList.length,
    dailyActivity: Object.entries(days).map(([date, count]) => ({ date, count })),
  });
}
