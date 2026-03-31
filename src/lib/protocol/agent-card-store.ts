import type { AgentCard } from "@/types/aip";
import {
  fetchAllOnChainAgents,
  isAgentOnChainByDid,
} from "@/lib/solana/registry-program";

/**
 * Hybrid Agent Card store — in-memory cache + on-chain registry.
 * In-memory for fast lookups; on-chain as source of truth.
 */
const g = globalThis as typeof globalThis & {
  __aip_cards_did?: Map<string, AgentCard>;
  __aip_cards_ep?: Map<string, AgentCard>;
  __aip_chain_synced?: boolean;
};
if (!g.__aip_cards_did) g.__aip_cards_did = new Map();
if (!g.__aip_cards_ep) g.__aip_cards_ep = new Map();

const cardsByDid = g.__aip_cards_did;
const cardsByEndpoint = g.__aip_cards_ep;

export function registerCard(card: AgentCard): void {
  cardsByDid.set(card.did, card);
  cardsByEndpoint.set(card.endpoint, card);
}

export function getCardByDid(did: string): AgentCard | null {
  return cardsByDid.get(did) ?? null;
}

export function getCardByEndpoint(endpoint: string): AgentCard | null {
  return cardsByEndpoint.get(endpoint) ?? null;
}

export function listCards(): AgentCard[] {
  return Array.from(cardsByDid.values());
}

export function removeCard(did: string): boolean {
  const card = cardsByDid.get(did);
  if (!card) return false;
  cardsByDid.delete(did);
  cardsByEndpoint.delete(card.endpoint);
  return true;
}

/**
 * Sync on-chain agents into in-memory cache.
 * Merges with existing in-memory cards (on-chain takes precedence).
 */
export async function syncFromChain(): Promise<number> {
  try {
    const onChainCards = await fetchAllOnChainAgents();
    for (const card of onChainCards) {
      // Remove any in-memory card with the same endpoint (avoid duplicates)
      const toRemove: string[] = [];
      cardsByDid.forEach((existing, existingDid) => {
        if (existing.endpoint === card.endpoint && existingDid !== card.did) {
          toRemove.push(existingDid);
        }
      });
      toRemove.forEach((d) => cardsByDid.delete(d));
      registerCard(card);
    }
    g.__aip_chain_synced = true;
    return onChainCards.length;
  } catch {
    return 0;
  }
}

/** Check if a specific agent is registered on-chain */
export async function checkOnChain(did: string): Promise<boolean> {
  try {
    return await isAgentOnChainByDid(did);
  } catch {
    return false;
  }
}

export function isChainSynced(): boolean {
  return g.__aip_chain_synced ?? false;
}
