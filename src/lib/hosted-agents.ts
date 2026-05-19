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
import type { McpServerConfig } from "./mcp/types";

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
  /** Optional MCP server connections — empty array means no MCP (default) */
  mcpServers: McpServerConfig[];
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
  mcp_servers?: string; // JSONB — '[]' default
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
  let mcpServers: McpServerConfig[] = [];
  try { if (row.mcp_servers) mcpServers = JSON.parse(row.mcp_servers); } catch { /* ignore */ }
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
    mcpServers,
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
    mcp_servers: JSON.stringify(config.mcpServers || []),
    active: config.active,
  };
}

/**
 * Load hosted agents from Supabase into cache. By default this is a
 * one-time bootstrap (skipped if the cache is already populated) so
 * cold-start latency stays low. Pass `{ force: true }` to force a
 * fresh read — useful for marketplace listing endpoints where stale
 * `active=false` rows would otherwise still appear in the cache.
 */
export async function loadHostedAgentsFromDb(opts: { force?: boolean } = {}): Promise<void> {
  if (!opts.force && g.__aip_hosted_loaded && store.size > 0) return;
  try {
    const sb = getSupabase();
    const { data } = await sb.from("hosted_agents").select("*").eq("active", true);
    if (data) {
      // Rebuild from scratch so deactivated rows are evicted on force-reload
      if (opts.force) store.clear();
      const activeIds = new Set<string>();
      for (const row of data as DbHostedAgent[]) {
        store.set(row.agent_id, toConfig(row));
        activeIds.add(row.agent_id);
      }
      if (opts.force) {
        // Drop any in-memory entries that no longer correspond to an active DB row
        for (const id of Array.from(store.keys())) {
          if (!activeIds.has(id)) store.delete(id);
        }
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
    const { error } = await sb.from("hosted_agents").upsert(toRow(config), { onConflict: "agent_id" });
    if (error) {
      // Non-throwing on purpose — the in-memory cache is already updated and
      // serving the agent works for the lifetime of the process. The most
      // common cause is a missing schema column (e.g. mcp_servers before the
      // 2026-05-20 migration). Surface the error so operators see it instead
      // of the previous silent swallow.
      console.error(`[hosted-agents] Supabase upsert failed for ${config.agentId}: ${error.message} — agent will not survive a restart. Apply sql/2026-05-20-add-mcp-servers-column.sql if the message mentions a missing column.`);
    }
  } catch (err) {
    console.error(`[hosted-agents] unexpected error registering ${config.agentId}:`, err);
  }
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
