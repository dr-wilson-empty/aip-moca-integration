/**
 * Supabase persistence for automations.
 */
import { getSupabase } from "./client";

export interface DbAutomation {
  id: string;
  wallet_address: string;
  name: string;
  prompt: string;
  schedule: string;
  budget_limit: number;
  budget_period: string;
  enabled: boolean;
  last_run?: string;
  total_spent: number;
  run_count: number;
  created_at?: string;
}

export interface DbAutomationResult {
  id: string;
  automation_id: string;
  agent_name?: string;
  capability?: string;
  input?: string;
  artifact?: string;
  estimated_cost?: string;
  status?: string;
  created_at?: string;
}

export async function dbListAutomations(walletAddress: string): Promise<DbAutomation[]> {
  const sb = getSupabase();
  const { data } = await sb.from("automations").select("*")
    .eq("wallet_address", walletAddress)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function dbGetAutomation(id: string): Promise<DbAutomation | null> {
  const sb = getSupabase();
  const { data } = await sb.from("automations").select("*").eq("id", id).single();
  return data;
}

export async function dbCreateAutomation(auto: DbAutomation): Promise<void> {
  const sb = getSupabase();
  await sb.from("automations").insert(auto);
}

export async function dbUpdateAutomation(id: string, update: Partial<DbAutomation>): Promise<void> {
  const sb = getSupabase();
  await sb.from("automations").update(update).eq("id", id);
}

export async function dbDeleteAutomation(id: string): Promise<void> {
  const sb = getSupabase();
  await sb.from("automations").delete().eq("id", id);
}

export async function dbInsertResult(result: DbAutomationResult): Promise<void> {
  const sb = getSupabase();
  await sb.from("automation_results").insert(result);
}

export async function dbListResults(automationId: string, limit = 20): Promise<DbAutomationResult[]> {
  const sb = getSupabase();
  const { data } = await sb.from("automation_results").select("*")
    .eq("automation_id", automationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
