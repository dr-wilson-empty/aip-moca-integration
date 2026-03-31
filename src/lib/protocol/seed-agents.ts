import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { COUNTERPART_AGENT_CARDS } from "@/lib/mock/agentCards";
import { registerCard, listCards, syncFromChain } from "./agent-card-store";
import { registerAgentOnChain, isAgentOnChain } from "@/lib/solana/registry-program";

const gs = globalThis as typeof globalThis & {
  __aip_seeded?: boolean;
  __aip_chain_registered?: boolean;
};
let seeded = gs.__aip_seeded ?? false;

/**
 * Demo ajanlarini in-memory store'a kaydet.
 * Birden fazla cagrilsa bile sadece bir kez calisir.
 */
export function seedDemoAgents(): void {
  if (seeded) return;
  seeded = true;
  gs.__aip_seeded = true;

  for (const card of Object.values(COUNTERPART_AGENT_CARDS)) {
    registerCard(card);
  }

  // On-chain sync + registration (background, non-blocking)
  if (!gs.__aip_chain_registered) {
    gs.__aip_chain_registered = true;
    registerAgentsOnChain().catch(() => {});
  }
}

/**
 * Register demo agents on-chain if not already registered.
 * Uses ESCROW_PRIVATE_KEY as the registration authority.
 */
async function registerAgentsOnChain(): Promise<void> {
  const key = process.env.ESCROW_PRIVATE_KEY;
  if (!key) return;

  let ownerKeypair: Keypair;
  try {
    ownerKeypair = Keypair.fromSecretKey(bs58.decode(key));
  } catch {
    return;
  }

  // First sync existing on-chain agents
  await syncFromChain();

  // Register each demo agent if not already on-chain
  for (const card of Object.values(COUNTERPART_AGENT_CARDS)) {
    try {
      const onChain = await isAgentOnChain(card.did);
      if (!onChain) {
        const sig = await registerAgentOnChain(ownerKeypair, card);
        console.log(`[registry] Registered ${card.name} on-chain: ${sig.slice(0, 16)}...`);
      }
    } catch (err) {
      // Might fail if already registered or insufficient funds — that's OK
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("already in use")) {
        console.error(`[registry] Failed to register ${card.name}:`, msg.slice(0, 80));
      }
    }
  }
}
