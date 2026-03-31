/**
 * Agent ratings and categories persistence.
 */
import { getSupabase } from "./client";

export interface DbRating {
  id: string;
  agent_did: string;
  wallet_address: string;
  task_id?: string;
  rating: number;
  comment?: string;
  created_at?: string;
}

export interface DbCategory {
  id: string;
  name: string;
  icon: string;
}

export async function dbGetCategories(): Promise<DbCategory[]> {
  const sb = getSupabase();
  const { data } = await sb.from("agent_categories").select("*").order("name");
  return data ?? [];
}

export async function dbSubmitRating(rating: DbRating): Promise<void> {
  const sb = getSupabase();
  await sb.from("agent_ratings").upsert(rating, { onConflict: "agent_did,wallet_address,task_id" });
}

export async function dbGetAgentRatings(agentDid: string): Promise<{ avg: number; count: number; ratings: DbRating[] }> {
  const sb = getSupabase();
  const { data } = await sb.from("agent_ratings")
    .select("*")
    .eq("agent_did", agentDid)
    .order("created_at", { ascending: false })
    .limit(20);

  const ratings = data ?? [];
  const count = ratings.length;
  const avg = count > 0 ? ratings.reduce((s, r) => s + r.rating, 0) / count : 0;
  return { avg, count, ratings };
}

export async function dbGetTopAgents(limit = 10): Promise<Array<{ agent_did: string; avg_rating: number; rating_count: number }>> {
  const sb = getSupabase();
  const { data } = await sb.from("agent_ratings").select("agent_did, rating");
  if (!data?.length) return [];

  const byAgent = new Map<string, number[]>();
  for (const r of data) {
    const arr = byAgent.get(r.agent_did) || [];
    arr.push(r.rating);
    byAgent.set(r.agent_did, arr);
  }

  return Array.from(byAgent.entries())
    .map(([agent_did, ratings]) => ({
      agent_did,
      avg_rating: ratings.reduce((s, r) => s + r, 0) / ratings.length,
      rating_count: ratings.length,
    }))
    .sort((a, b) => b.avg_rating - a.avg_rating)
    .slice(0, limit);
}
