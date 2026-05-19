import { getDemoAgentCards, getWebSearchAgent } from "@/lib/mock/agentCards";
import { registerCard, syncFromChain } from "./agent-card-store";
import { loadHostedAgentsFromDb, listHostedAgents, registerHostedAgent, getHostedAgent } from "@/lib/hosted-agents";
import { canonicalAgentDid } from "@/lib/identity/canonical-did";
import { getAppUrl } from "@/lib/config/app-url";
import { getAuthorityAddress, getAuthorityKeypair } from "@/lib/payment/escrow";
import {
  isAgentOnChain,
  registerAgentOnChain,
} from "@/lib/solana/registry-program";
import type { AgentCard } from "@/types/aip";

const gs = globalThis as typeof globalThis & {
  __aip_seeded?: boolean;
  __aip_chain_registered?: boolean;
  __aip_onchain_seed_inflight?: Promise<void>;
};
let seeded = gs.__aip_seeded ?? false;

/**
 * Seed platform agents + hosted agents from Supabase.
 * Demo agents (Summary, Data, Audit) are registered as hosted agents
 * so they run through the same /api/hosted-agent endpoint, and as of
 * Önkoşul 0 / Modül B they are ALSO registered on-chain (idempotent —
 * skips PDAs that already exist).
 */
export function seedDemoAgents(): void {
  if (seeded) return;
  seeded = true;
  gs.__aip_seeded = true;

  // Register Web Search Agent (platform built-in, separate route)
  registerCard(getWebSearchAgent());

  // Register demo agents as hosted agents + card store
  const demoAgents = getDemoAgentCards();
  let authority = "";
  try { authority = getAuthorityAddress(); } catch { /* no key */ }

  for (const [agentId, card] of Object.entries(demoAgents)) {
    registerCard(card);

    // Ensure hosted agent config exists in Supabase (so /api/hosted-agent can serve them)
    if (authority && !getHostedAgent(agentId)) {
      const DEMO_PROMPTS: Record<string, string> = {
        "summary-agent": "You are a text processing agent. Summarize, classify, or transform text as requested. Be concise and accurate.",
        "data-agent": "You are a data retrieval agent. Fetch and analyze blockchain data, DeFi protocols, and on-chain metrics. Provide structured, factual responses.",
        "audit-agent": "You are a smart contract security auditor and DeFi risk analyst. Analyze code for vulnerabilities and assess protocol risks. Be thorough and technical.",
      };
      registerHostedAgent({
        agentId,
        ownerAddress: authority,
        name: card.name,
        description: card.capabilities.map((c) => c.description).join(", "),
        systemPrompt: DEMO_PROMPTS[agentId] || "You are a helpful AI agent.",
        tier: "platform",
        provider: "anthropic",
        capabilities: card.capabilities.map((c) => ({
          id: c.id,
          description: c.description,
          pricing: { amount: c.pricing.amount, token: "USDC", network: "solana" },
        })),
        canOrchestrate: false,
        isPublic: true,
        mcpServers: [],
        createdAt: new Date().toISOString(),
        active: true,
      }).catch(() => {});
    }
  }

  // Load user-created hosted agents from Supabase
  loadHostedAgentsFromDb().then(() => {
    const base = getAppUrl();
    for (const ha of listHostedAgents().filter((a) => a.isPublic !== false)) {
      registerCard({
        did: canonicalAgentDid(ha.ownerAddress, ha.agentId),
        name: ha.name,
        description: ha.description || undefined,
        version: "1.0.0",
        endpoint: `${base}/api/hosted-agent?agentId=${ha.agentId}`,
        type: "Task",
        walletAddress: ha.ownerAddress,
        capabilities: ha.capabilities.map((c) => ({
          id: c.id,
          description: c.description,
          pricing: { amount: c.pricing.amount, token: "USDC" as const, network: "solana" as const },
        })),
      });
    }
  }).catch(() => {});

  // Sync from on-chain registry (background)
  if (!gs.__aip_chain_registered) {
    gs.__aip_chain_registered = true;
    syncFromChain().catch(() => {});
  }

  // Register demo agents on-chain (idempotent, background, single-flight).
  if (!gs.__aip_onchain_seed_inflight) {
    gs.__aip_onchain_seed_inflight = registerDemoAgentsOnChain(demoAgents).catch((err) => {
      console.warn("[seed-agents] on-chain registration failed:", err?.message ?? err);
    });
  }
}

/**
 * Register hosted demo agents on the AIP registry program if they
 * aren't already there. Designed to be safe to call on every server
 * boot: each PDA existence is checked first, and any failure on one
 * agent doesn't abort the others.
 *
 * Requires `ESCROW_PRIVATE_KEY` — the platform authority signs and
 * pays rent (≈0.0009 SOL per PDA on devnet).
 */
async function registerDemoAgentsOnChain(demoAgents: Record<string, AgentCard>): Promise<void> {
  console.log("[seed-agents] starting on-chain registration check…");
  let authorityKp;
  try {
    authorityKp = getAuthorityKeypair();
  } catch (err) {
    console.warn("[seed-agents] no authority keypair available:", err instanceof Error ? err.message : err);
    return;
  }
  const ownerPubkey = authorityKp.publicKey.toBase58();
  console.log(`[seed-agents] authority ${ownerPubkey}, checking ${Object.keys(demoAgents).length} agents…`);

  for (const [agentId, card] of Object.entries(demoAgents)) {
    try {
      if (await isAgentOnChain(ownerPubkey, agentId)) {
        console.log(`[seed-agents] ${agentId} already on-chain — skip`);
        continue;
      }
      console.log(`[seed-agents] registering ${agentId}…`);
      const sig = await registerAgentOnChain(authorityKp, agentId, card);
      console.log(`[seed-agents] on-chain registered ${agentId} → tx ${sig}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[seed-agents] failed to register ${agentId} on-chain: ${msg}`);
    }
  }
  console.log("[seed-agents] on-chain registration pass complete.");
}
