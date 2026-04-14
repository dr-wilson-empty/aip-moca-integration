/**
 * Hosted Agent Config Store — Supabase-persisted with in-memory cache.
 *
 * Each hosted agent has a system prompt, model config, and capabilities.
 * The platform runs the AI calls on behalf of the user.
 *
 * On startup: loads all active hosted agents from Supabase into memory.
 * On register/update/delete: writes to Supabase + updates cache.
 */
import { getSupabase } from "./supabase/client";
import { encrypt, decrypt, isEncrypted } from "./auth/encrypt";

export type AIProvider = "anthropic" | "openai" | "google";
export type AITier = "platform" | "custom";

export interface HostedAgentConfig {
  agentId: string;
  ownerAddress: string; // Solana wallet
  name: string;
  description: string;
  systemPrompt: string;
  tier: AITier;
  provider: AIProvider;
  customApiKey?: string; // decrypted in-memory, AES-256-GCM encrypted at rest
  capabilities: Array<{
    id: string;
    description: string;
    pricing: { amount: string; token: string; network: string };
  }>;
  /** When true, agent can autonomously call other agents using its budget */
  canOrchestrate: boolean;
  /** When true, agent is listed on the public marketplace. Default true. */
  isPublic: boolean;
  createdAt: string;
  active: boolean;
}

/* ------------------------------------------------------------------ */
/*  In-memory cache (globalThis for Next.js hot-reload persistence)    */
/* ------------------------------------------------------------------ */

const g = globalThis as typeof globalThis & {
  __aip_hosted_agents?: Map<string, HostedAgentConfig>;
  __aip_hosted_loaded?: boolean;
};
if (!g.__aip_hosted_agents) g.__aip_hosted_agents = new Map();

const store = g.__aip_hosted_agents;

/* ------------------------------------------------------------------ */
/*  Supabase persistence                                               */
/* ------------------------------------------------------------------ */

interface DbHostedAgent {
  agent_id: string;
  owner_address: string;
  name: string;
  description: string;
  system_prompt: string;
  tier: string;
  provider: string;
  custom_api_key?: string;
  capabilities_json: string;
  can_orchestrate: boolean;
  is_public: boolean;
  active: boolean;
  created_at?: string;
}

function decryptApiKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    return isEncrypted(raw) ? decrypt(raw) : raw;
  } catch {
    return raw; // fallback: return as-is if decryption fails (legacy plaintext)
  }
}

function toConfig(row: DbHostedAgent): HostedAgentConfig {
  let caps: HostedAgentConfig["capabilities"] = [];
  try { caps = JSON.parse(row.capabilities_json); } catch { /* ignore */ }
  return {
    agentId: row.agent_id,
    ownerAddress: row.owner_address,
    name: row.name,
    description: row.description,
    systemPrompt: row.system_prompt,
    tier: row.tier as AITier,
    provider: row.provider as AIProvider,
    customApiKey: decryptApiKey(row.custom_api_key),
    capabilities: caps,
    canOrchestrate: row.can_orchestrate ?? false,
    isPublic: row.is_public ?? true,
    createdAt: row.created_at || new Date().toISOString(),
    active: row.active,
  };
}

function toRow(config: HostedAgentConfig): DbHostedAgent {
  return {
    agent_id: config.agentId,
    owner_address: config.ownerAddress,
    name: config.name,
    description: config.description,
    system_prompt: config.systemPrompt,
    tier: config.tier,
    provider: config.provider,
    custom_api_key: config.customApiKey ? encrypt(config.customApiKey) : undefined,
    capabilities_json: JSON.stringify(config.capabilities),
    can_orchestrate: config.canOrchestrate ?? false,
    is_public: config.isPublic ?? true,
    active: config.active,
  };
}

/** Load all hosted agents from Supabase into cache (called once on startup) */
export async function loadHostedAgentsFromDb(): Promise<void> {
  if (g.__aip_hosted_loaded && store.size > 0) return;
  try {
    const sb = getSupabase();
    const { data } = await sb.from("hosted_agents").select("*").eq("active", true);
    if (data) {
      for (const row of data as DbHostedAgent[]) {
        store.set(row.agent_id, toConfig(row));
      }
    }
    g.__aip_hosted_loaded = true;
  } catch {
    // Table might not exist yet — silently continue with empty cache
    g.__aip_hosted_loaded = true;
  }
}

/* ------------------------------------------------------------------ */
/*  Public API (cache + Supabase)                                      */
/* ------------------------------------------------------------------ */

export async function registerHostedAgent(config: HostedAgentConfig): Promise<void> {
  store.set(config.agentId, config);
  try {
    const sb = getSupabase();
    await sb.from("hosted_agents").upsert(toRow(config), { onConflict: "agent_id" });
  } catch { /* non-blocking */ }
}

export function getHostedAgent(agentId: string): HostedAgentConfig | null {
  return store.get(agentId) ?? null;
}

export function getHostedAgentsByOwner(ownerAddress: string): HostedAgentConfig[] {
  return Array.from(store.values()).filter((a) => a.ownerAddress === ownerAddress);
}

export async function updateHostedAgent(agentId: string, updates: Partial<HostedAgentConfig>): Promise<boolean> {
  const existing = store.get(agentId);
  if (!existing) return false;
  const updated = { ...existing, ...updates };
  store.set(agentId, updated);
  try {
    const sb = getSupabase();
    await sb.from("hosted_agents").upsert(
      { ...toRow(updated), updated_at: new Date().toISOString() },
      { onConflict: "agent_id" }
    );
  } catch { /* non-blocking */ }
  return true;
}

export async function deleteHostedAgent(agentId: string): Promise<boolean> {
  const existed = store.delete(agentId);
  try {
    const sb = getSupabase();
    await sb.from("hosted_agents").update({ active: false, updated_at: new Date().toISOString() }).eq("agent_id", agentId);
  } catch { /* non-blocking */ }
  return existed;
}

export function listHostedAgents(): HostedAgentConfig[] {
  return Array.from(store.values()).filter((a) => a.active);
}
