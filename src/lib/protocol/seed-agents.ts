import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { COUNTERPART_AGENT_CARDS, WEB_SEARCH_AGENT } from "@/lib/mock/agentCards";
import { registerCard, syncFromChain } from "./agent-card-store";
import { registerAgentOnChain, isAgentOnChain } from "@/lib/solana/registry-program";
import { loadHostedAgentsFromDb, listHostedAgents } from "@/lib/hosted-agents";

const gs = globalThis as typeof globalThis & {
  __aip_seeded?: boolean;
  __aip_chain_registered?: boolean;
};
let seeded = gs.__aip_seeded ?? false;

const AGENT_IDS: Record<string, string> = {
  "http://localhost:4001/a2a": "summary-agent",
  "http://localhost:4002/a2a": "data-agent",
  "http://localhost:4003/a2a": "audit-agent",
};

/**
 * Seed demo agents.
 * First registers in-memory (fast), then syncs from on-chain in background.
 * On-chain versions replace in-memory ones when sync completes.
 */
export function seedDemoAgents(): void {
  if (seeded) return;
  seeded = true;
  gs.__aip_seeded = true;

  // In-memory seed for immediate availability
  for (const card of Object.values(COUNTERPART_AGENT_CARDS)) {
    registerCard(card);
  }
  // Platform-hosted Web Search Agent (uses Tavily API, no external process needed)
  registerCard(WEB_SEARCH_AGENT);

  // Load hosted agents from Supabase and register their cards
  loadHostedAgentsFromDb().then(() => {
    for (const ha of listHostedAgents()) {
      registerCard({
        did: `did:aip:${ha.ownerAddress.slice(0, 8)}:${ha.agentId}`,
        name: ha.name,
        version: "1.0.0",
        endpoint: `http://localhost:3000/api/hosted-agent?agentId=${ha.agentId}`,
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

  // On-chain registration + sync (background)
  if (!gs.__aip_chain_registered) {
    gs.__aip_chain_registered = true;
    registerAndSync().catch(() => {});
  }
}

async function registerAndSync(): Promise<void> {
  const key = process.env.ESCROW_PRIVATE_KEY;
  if (!key) return;

  let ownerKeypair: Keypair;
  try {
    ownerKeypair = Keypair.fromSecretKey(bs58.decode(key));
  } catch {
    return;
  }

  // Register demo agents on-chain if not already
  for (const card of Object.values(COUNTERPART_AGENT_CARDS)) {
    const agentId = AGENT_IDS[card.endpoint];
    if (!agentId) continue;

    try {
      const onChain = await isAgentOnChain(ownerKeypair.publicKey.toBase58(), agentId);
      if (!onChain) {
        const sig = await registerAgentOnChain(ownerKeypair, agentId, card);
        console.log(`[registry] Registered ${card.name} (${agentId}): ${sig.slice(0, 16)}...`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("already in use")) {
        console.error(`[registry] Failed to register ${card.name}:`, msg.slice(0, 80));
      }
    }
  }

  // Sync from chain — on-chain versions override in-memory
  await syncFromChain();
}
