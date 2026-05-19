import { z } from "zod";
import { AgentCardSchema } from "./agent-card.js";

export const ListedAgentSchema = AgentCardSchema.extend({
  onChain: z.boolean().optional(),
  hasMcp: z.boolean().optional(),
});

export const AgentListResponseSchema = z.object({
  agents: z.array(ListedAgentSchema),
  total: z.number().int().optional(),
  page: z.number().int().optional(),
  limit: z.number().int().optional(),
  totalPages: z.number().int().optional(),
});

export const AgentDetailResponseSchema = ListedAgentSchema.extend({
  source: z.enum(["on-chain", "memory"]).optional(),
});

export const AgentStatusSchema = z.object({
  did: z.string(),
  name: z.string(),
  endpoint: z.string(),
  online: z.boolean(),
  latencyMs: z.number(),
});

export const AgentStatusListSchema = z.array(AgentStatusSchema);

export type ListedAgent = z.infer<typeof ListedAgentSchema>;
export type AgentListResponse = z.infer<typeof AgentListResponseSchema>;
export type AgentDetail = z.infer<typeof AgentDetailResponseSchema>;
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export interface ListFilters {
  type?: "Task" | "LLM" | "Execution";
  maxPrice?: number;
  onlineOnly?: boolean;
}

export function cheapestPrice(agent: ListedAgent): number {
  return agent.capabilities.reduce((min, cap) => {
    const n = parseFloat(cap.pricing.amount);
    return Number.isFinite(n) && n < min ? n : min;
  }, Number.POSITIVE_INFINITY);
}

export function applyFilters(
  agents: ListedAgent[],
  filters: ListFilters,
  statusByDid: Map<string, AgentStatus> | undefined,
): ListedAgent[] {
  return agents.filter((agent) => {
    if (filters.type && agent.type !== filters.type) return false;
    if (filters.maxPrice !== undefined) {
      const min = cheapestPrice(agent);
      if (!(min <= filters.maxPrice)) return false;
    }
    if (filters.onlineOnly) {
      const s = statusByDid?.get(agent.did);
      if (!s || !s.online) return false;
    }
    return true;
  });
}
