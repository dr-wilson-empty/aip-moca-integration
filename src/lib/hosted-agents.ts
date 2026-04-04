/**
 * Hosted Agent Config Store — server-side in-memory storage
 * for no-code agents created via the platform UI.
 *
 * Each hosted agent has a system prompt, model config, and capabilities.
 * The platform runs the AI calls on behalf of the user.
 */

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
  customApiKey?: string; // encrypted, only for tier="custom"
  capabilities: Array<{
    id: string;
    description: string;
    pricing: { amount: string; token: string; network: string };
  }>;
  createdAt: string;
  active: boolean;
}

// In-memory store (globalThis for Next.js hot-reload persistence)
const g = globalThis as typeof globalThis & {
  __aip_hosted_agents?: Map<string, HostedAgentConfig>;
};
if (!g.__aip_hosted_agents) g.__aip_hosted_agents = new Map();

const store = g.__aip_hosted_agents;

export function registerHostedAgent(config: HostedAgentConfig): void {
  store.set(config.agentId, config);
}

export function getHostedAgent(agentId: string): HostedAgentConfig | null {
  return store.get(agentId) ?? null;
}

export function getHostedAgentsByOwner(ownerAddress: string): HostedAgentConfig[] {
  return Array.from(store.values()).filter((a) => a.ownerAddress === ownerAddress);
}

export function updateHostedAgent(agentId: string, updates: Partial<HostedAgentConfig>): boolean {
  const existing = store.get(agentId);
  if (!existing) return false;
  store.set(agentId, { ...existing, ...updates });
  return true;
}

export function deleteHostedAgent(agentId: string): boolean {
  return store.delete(agentId);
}

export function listHostedAgents(): HostedAgentConfig[] {
  return Array.from(store.values()).filter((a) => a.active);
}
