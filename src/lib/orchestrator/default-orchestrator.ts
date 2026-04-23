/**
 * Default Orchestrator Agent — auto-created per wallet.
 *
 * Every wallet gets an Orchestrator Agent that can autonomously
 * plan and delegate tasks to other agents using its budget.
 * This is the platform's revenue funnel: orchestrator calls
 * platform agents → each call generates 20% commission.
 */
import {
  registerHostedAgent,
  getHostedAgent,
  loadHostedAgentsFromDb,
  getHostedAgentsByOwner,
  type HostedAgentConfig,
} from "@/lib/hosted-agents";
import { registerCard } from "@/lib/protocol/agent-card-store";
import { canonicalAgentDid } from "@/lib/identity/canonical-did";

const ORCHESTRATOR_ID_PREFIX = "orch-";

/** Deterministic agent ID per wallet */
export function getOrchestratorId(walletAddress: string): string {
  return `${ORCHESTRATOR_ID_PREFIX}${walletAddress.slice(0, 12).toLowerCase()}`;
}

const SYSTEM_PROMPT =
  "You are an Orchestrator Agent — an autonomous AI that plans and executes multi-step tasks " +
  "by delegating to specialized agents on the AIP network.\n\n" +
  "When given a task:\n" +
  "1. Break it down into sub-tasks that can be handled by available agents\n" +
  "2. Choose the best agent for each sub-task based on capability and cost\n" +
  "3. Execute sub-tasks in the optimal order, passing results between steps\n" +
  "4. Synthesize all results into a comprehensive final response\n\n" +
  "Rules:\n" +
  "- Always prefer the most cost-effective agent for each sub-task\n" +
  "- Use web.search for any current/real-time information needs\n" +
  "- Respect the user's language preference\n" +
  "- Keep total cost within the budget allocated";

const DEFAULT_CAPABILITIES: HostedAgentConfig["capabilities"] = [
  {
    id: "orchestrate.task",
    description: "Autonomous orchestration — 0.05 USDC per agent step",
    pricing: { amount: "0.05", token: "USDC", network: "solana" },
  },
];

/**
 * Ensure a default orchestrator exists for the given wallet.
 * Returns the config (existing or newly created).
 */
export async function ensureDefaultOrchestrator(
  walletAddress: string,
  baseUrl: string,
): Promise<HostedAgentConfig> {
  await loadHostedAgentsFromDb();

  const agentId = getOrchestratorId(walletAddress);

  // Check if already exists
  const existing = getHostedAgent(agentId);
  if (existing) return existing;

  // Also check if user already has ANY orchestrator (maybe they created one manually)
  const userAgents = getHostedAgentsByOwner(walletAddress);
  const existingOrch = userAgents.find((a) => a.canOrchestrate && a.active);
  if (existingOrch) return existingOrch;

  // Create new default orchestrator
  const config: HostedAgentConfig = {
    agentId,
    ownerAddress: walletAddress,
    name: "Orchestrator Agent",
    description: "Your default autonomous agent — plans and delegates tasks to specialized agents on the network.",
    systemPrompt: SYSTEM_PROMPT,
    tier: "platform",
    provider: "anthropic",
    capabilities: DEFAULT_CAPABILITIES,
    canOrchestrate: true,
    isPublic: false,
    mcpServers: [],
    createdAt: new Date().toISOString(),
    active: true,
  };

  await registerHostedAgent(config);

  // Register as agent card for marketplace/discovery
  const hostedEndpoint = `${baseUrl}/api/hosted-agent?agentId=${agentId}`;
  registerCard({
    did: canonicalAgentDid(walletAddress, agentId),
    name: config.name,
    version: "1.0.0",
    endpoint: hostedEndpoint,
    type: "Task",
    walletAddress,
    capabilities: DEFAULT_CAPABILITIES.map((c) => ({
      id: c.id,
      description: c.description,
      pricing: { amount: c.pricing.amount, token: "USDC" as const, network: "solana" as const },
    })),
  });

  return config;
}

/** Check if an agent ID is a default orchestrator */
export function isDefaultOrchestrator(agentId: string): boolean {
  return agentId.startsWith(ORCHESTRATOR_ID_PREFIX);
}
