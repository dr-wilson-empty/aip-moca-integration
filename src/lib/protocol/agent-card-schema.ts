import type { AgentCard, Capability, AgentType } from "@/types/aip";

const VALID_TYPES: AgentType[] = ["LLM", "Task", "Execution"];

function isCapability(val: unknown): val is Capability {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  if (typeof obj.id !== "string" || !obj.id.trim()) return false;
  if (typeof obj.description !== "string" || !obj.description.trim()) return false;
  if (typeof obj.pricing !== "object" || obj.pricing === null) return false;
  const p = obj.pricing as Record<string, unknown>;
  if (typeof p.amount !== "string" || isNaN(parseFloat(p.amount))) return false;
  if (p.token !== "USDC") return false;
  if (p.network !== "solana") return false;
  return true;
}

/**
 * Runtime dogrulama: bilinmeyen veriyi AgentCard'a donusturur.
 * Gecersiz veri icin null doner.
 */
export function validateAgentCard(data: unknown): AgentCard | null {
  if (typeof data !== "object" || data === null) return null;
  const obj = data as Record<string, unknown>;

  if (typeof obj.did !== "string" || !obj.did.startsWith("did:")) return null;
  if (typeof obj.name !== "string" || !obj.name.trim()) return null;
  if (typeof obj.version !== "string" || !obj.version.trim()) return null;
  if (typeof obj.endpoint !== "string" || !obj.endpoint.trim()) return null;
  // Only allow http/https endpoints — block javascript:, data:, etc.
  try {
    const endpointUrl = new URL(obj.endpoint);
    if (!["http:", "https:"].includes(endpointUrl.protocol)) return null;
  } catch {
    return null; // invalid URL
  }
  if (typeof obj.type !== "string" || !VALID_TYPES.includes(obj.type as AgentType)) return null;
  if (!Array.isArray(obj.capabilities) || obj.capabilities.length === 0) return null;
  if (!obj.capabilities.every(isCapability)) return null;

  return {
    did: obj.did,
    name: obj.name,
    version: obj.version,
    endpoint: obj.endpoint,
    type: obj.type as AgentType,
    capabilities: obj.capabilities as Capability[],
    ...(typeof obj.walletAddress === "string" && { walletAddress: obj.walletAddress }),
  };
}
