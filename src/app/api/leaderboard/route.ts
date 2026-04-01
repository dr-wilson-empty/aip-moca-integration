import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/client";

/**
 * GET /api/leaderboard
 * Returns top users by task count and USDC spent.
 */
export async function GET() {
  const sb = getSupabase();

  // Top users by completed tasks
  const { data: tasks } = await sb
    .from("tasks")
    .select("caller_address, amount, state")
    .eq("state", "COMPLETED");

  if (!tasks?.length) {
    return NextResponse.json({ users: [] });
  }

  // Aggregate per wallet
  const map = new Map<string, { address: string; tasks: number; spent: number }>();
  for (const t of tasks) {
    const entry = map.get(t.caller_address) || { address: t.caller_address, tasks: 0, spent: 0 };
    entry.tasks++;
    entry.spent += parseFloat(t.amount || "0");
    map.set(t.caller_address, entry);
  }

  const users = Array.from(map.values())
    .sort((a, b) => b.tasks - a.tasks)
    .slice(0, 50)
    .map((u, i) => ({ rank: i + 1, ...u, spent: u.spent.toFixed(2) }));

  return NextResponse.json({ users });
}
