/**
 * User preferences persistence.
 */
import { getSupabase } from "./client";

export interface UserPreferences {
  wallet_address: string;
  language: string;          // "auto" | "tr" | "en"
  detail_level: string;      // "short" | "medium" | "detailed"
  favorite_agents: string[]; // agent DIDs
  frequent_capabilities: string[]; // capability IDs
  custom_instructions: string;
  task_count: number;
}

const DEFAULT_PREFS: Omit<UserPreferences, "wallet_address"> = {
  language: "auto",
  detail_level: "medium",
  favorite_agents: [],
  frequent_capabilities: [],
  custom_instructions: "",
  task_count: 0,
};

export async function dbGetPreferences(walletAddress: string): Promise<UserPreferences> {
  try {
    const sb = getSupabase();
    const { data } = await sb.from("user_preferences").select("*").eq("wallet_address", walletAddress).single();
    if (data) return data;
  } catch { /* not found */ }
  return { wallet_address: walletAddress, ...DEFAULT_PREFS };
}

export async function dbUpsertPreferences(prefs: Partial<UserPreferences> & { wallet_address: string }): Promise<void> {
  const sb = getSupabase();
  await sb.from("user_preferences").upsert(
    { ...prefs, updated_at: new Date().toISOString() },
    { onConflict: "wallet_address" }
  );
}

/** Track a completed task — updates frequent capabilities and task count */
export async function dbTrackTask(walletAddress: string, capabilityId: string, agentDid: string): Promise<void> {
  try {
    const prefs = await dbGetPreferences(walletAddress);

    // Update frequent capabilities (keep top 10)
    const caps = [...prefs.frequent_capabilities];
    if (!caps.includes(capabilityId)) caps.push(capabilityId);
    if (caps.length > 10) caps.shift();

    // Update favorite agents (keep top 5)
    const agents = [...prefs.favorite_agents];
    // Move to end (most recent)
    const idx = agents.indexOf(agentDid);
    if (idx >= 0) agents.splice(idx, 1);
    agents.push(agentDid);
    if (agents.length > 5) agents.shift();

    await dbUpsertPreferences({
      wallet_address: walletAddress,
      frequent_capabilities: caps,
      favorite_agents: agents,
      task_count: prefs.task_count + 1,
    });
  } catch { /* non-blocking */ }
}
